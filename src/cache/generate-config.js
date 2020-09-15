const AWS = require('aws-sdk');
const config = require('../config');
const logger = require('../utils/logging');

const BASE_CONFIG = {
  cacheDuration: 60,
  primary: { host: 'localhost', port: '6379' },
  reader: { host: 'localhost', port: '6379' },
  retryDelay: 10000,
  redisGetTimeout: 3000,
  l1CacheSettings: { ttl: 60000, size: 1000, minLatencyToStore: 50 },
};

const updateRedisEndpoints = async () => {
  const env = config.clusterEnv;

  if (env === 'development') {
    logger.log('Running locally, keeping base configuration.');
    return {};
  }

  const ec = new AWS.ElastiCache({
    region: config.awsRegion,
  });

  const r = await ec.describeReplicationGroups({
    ReplicationGroupId: `biomage-redis-${config.clusterEnv}`,
  }).promise();

  // There is only one group matching the ID.
  const clusterProps = r.ReplicationGroups[0];

  logger.log(`Found replication group ${clusterProps.ReplicationGroupId} (${clusterProps.Description}).`);

  // Per AWS API docs:
  // A list of node groups in this replication group.
  // For Redis (cluster mode disabled) replication groups, this is a single-element list.
  const clusterEndpoints = clusterProps.NodeGroups[0];

  logger.log('Updating cache configuration to use proper endpoints...');

  return {
    primary: {
      host: clusterEndpoints.PrimaryEndpoint.Address,
      port: clusterEndpoints.PrimaryEndpoint.Port,
    },
    reader: {
      host: clusterEndpoints.ReaderEndpoint.Address,
      port: clusterEndpoints.ReaderEndpoint.Port,
    },
  };
};

const generateConfig = async () => {
  logger.log('Attempting to fetch URLs for Redis cluster endpoints...');
  const redisEndpoints = await updateRedisEndpoints();

  return { ...BASE_CONFIG, ...redisEndpoints };
};

module.exports = generateConfig;
