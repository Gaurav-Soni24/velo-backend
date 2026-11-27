/**
 * Zero-setup demo: starts the API with an in-memory MongoDB and demo data.
 * No MongoDB install needed. Data disappears when you stop it.
 *   npm run dev:memory
 */
require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('bike-rental-iot');
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  // Demo-only admin login, used when .env does not set one. Never used in production.
  if (!process.env.ADMIN_EMAIL || !(process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH)) {
    process.env.ADMIN_EMAIL = 'admin@velo.local';
    process.env.ADMIN_PASSWORD = 'velo-demo-admin';
    console.log('Demo admin login: admin@velo.local / velo-demo-admin (set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in .env to change)');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
  }

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
