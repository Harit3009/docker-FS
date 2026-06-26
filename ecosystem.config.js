// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'nestjs-core-api',
      script: 'dist/src/main.js',
      instances: 8, // Optimized multi-core worker footprint
      exec_mode: 'cluster', // Enables native cluster module mapping
      node_args: '-r dotenv/config', // 👈 Cleanly preloads your environment variables across all workers
      env: {
        NODE_ENV: 'production',
        NODE_TLS_REJECT_UNAUTHORIZED: '0', // 👈 Insecure TLS bypass carried over
        TOTAL_PM2_NODES: 8,
      },
    },
  ],
};
