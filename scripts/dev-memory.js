/**
 * Zero-setup demo: starts the API with an in-memory MongoDB and demo data.
 * No MongoDB install needed. Data disappears when you stop it.
 *   npm run dev:memory
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('bike-rental-iot');
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  await require('./seed')();
  const app = require('../server');
  const port = process.env.PORT || 5000;
  const server = app.listen(port, () => {
    console.log(`\nVelo backend (in-memory database) on http://localhost:${port}`);
    console.log('Try: npm run ground-station   (in another terminal, simulator mode)\n');
  });

  const stop = async () => {
    server.close();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
