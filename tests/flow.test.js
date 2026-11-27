/**
 * End-to-end test of the Velo flow against a real (in-memory) MongoDB.
 *   npm test
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.DEVICE_API_KEY = 'test-device-key';
process.env.MISSING_BIKE_TIMEOUT_MINUTES = '10';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'correct horse battery';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

let mongod;
let app;
const DEVICE = { 'x-device-key': 'test-device-key' };
let AUTH = {};
// Admin requests carry the session token from a real login.
const A = {
  get: (url) => request(app).get(url).set(AUTH),
  post: (url) => request(app).post(url).set(AUTH),
  patch: (url) => request(app).patch(url).set(AUTH),
  delete: (url) => request(app).delete(url).set(AUTH),
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  app = require('../server');
  await require('../src/config/database')(process.env.MONGODB_URI);
  const res = await A.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'correct horse battery' });
  AUTH = { Authorization: `Bearer ${res.body.data.token}` };
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  await A.post('/api/admin/users').send({ name: 'Aarav', rfidTag: '04a1b2c3', rollNumber: 'CSE1' });
  await A.post('/api/admin/users').send({ name: 'Diya', rfidTag: '04D4E5F6', rollNumber: 'ECE1' });
  await A.post('/api/admin/bikes').send({ bikeId: 1, bikeName: 'Velo 1' });
  await A.post('/api/admin/bikes').send({ bikeId: 2, bikeName: 'Velo 2' });
});

const scan = (rfidTag) => request(app).post('/api/device/scan').set(DEVICE).send({ rfidTag, deviceId: 'stand-01' });

test('device endpoints reject a missing or wrong key', async () => {
  await request(app).post('/api/device/scan').send({ rfidTag: '04A1B2C3' }).expect(401);
  await request(app).post('/api/device/scan').set('x-device-key', 'nope').send({ rfidTag: '04A1B2C3' }).expect(401);
});

test('tap rents the first free bike, second tap returns it', async () => {
  const rent = await scan('04A1B2C3').expect(201);
  assert.equal(rent.body.action, 'rent');
  assert.equal(rent.body.bike.bikeId, 1);
  assert.equal(rent.body.bike.status, 'rented');

  const stats1 = await A.get('/api/admin/dashboard/stats').expect(200);
  assert.equal(stats1.body.data.bikes.rented, 1);
  assert.equal(stats1.body.data.rentals.ongoing, 1);

  const back = await scan('04A1B2C3').expect(200);
  assert.equal(back.body.action, 'return');
  assert.equal(back.body.bike.status, 'available');
  assert.ok(back.body.rental.duration >= 1);

  const stats2 = await A.get('/api/admin/dashboard/stats').expect(200);
  assert.equal(stats2.body.data.rentals.completed, 1);
  assert.equal(stats2.body.data.bikes.available, 2);
});

test('RFID tags are case-insensitive', async () => {
  const res = await scan('04A1b2C3').expect(201);
  assert.equal(res.body.user.name, 'Aarav');
});

test('two riders get different bikes and a third is refused when none are left', async () => {
  const a = await scan('04A1B2C3').expect(201);
  const b = await scan('04D4E5F6').expect(201);
  assert.notEqual(a.body.bike.bikeId, b.body.bike.bikeId);

  await A.post('/api/admin/users').send({ name: 'Rohan', rfidTag: '04112233' });
  const c = await scan('04112233').expect(404);
  assert.match(c.body.message, /No available bikes/);
});

test('simultaneous taps never hand out the same bike', async () => {
  await A.post('/api/admin/users').send({ name: 'Rohan', rfidTag: '04112233' });
  const results = await Promise.all([scan('04A1B2C3'), scan('04D4E5F6'), scan('04112233')]);
  const bikes = results.filter((r) => r.status === 201).map((r) => r.body.bike.bikeId);
  assert.equal(new Set(bikes).size, bikes.length);
  assert.equal(bikes.length, 2); // only two bikes exist
});

test('unknown cards and disabled accounts are rejected and logged', async () => {
  await scan('DEADBEEF').expect(404);
  const users = await A.get('/api/admin/users');
  const aarav = users.body.data.find((u) => u.name === 'Aarav');
  await A.patch(`/api/admin/users/${aarav._id}`).send({ isActive: false }).expect(200);
  await scan('04A1B2C3').expect(403);

  const events = await A.get('/api/admin/events').expect(200);
  assert.equal(events.body.data.filter((e) => !e.success).length, 2);
});

test('camera: an available bike that disappears is flagged missing, and recovers when seen again', async () => {
  const bikes = (await A.get('/api/admin/bikes')).body.data;
  const now = new Date();
  // Camera sees both bikes, establishing "last seen".
  await request(app).post('/api/device/camera').set(DEVICE).send({ bikesPresent: [1, 2], timestamp: now }).expect(200);

  // 15 minutes later the camera only sees bike 2.
  const later = new Date(now.getTime() + 15 * 60000);
  const frame = await request(app).post('/api/device/camera').set(DEVICE).send({ bikesPresent: [2], timestamp: later }).expect(200);
  assert.equal(frame.body.missingFlagged, 1);

  const alerts = (await A.get('/api/admin/alerts?resolved=false')).body.data;
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'missing_mismatch');
  assert.equal(alerts[0].bikeId.bikeId, 1);
  assert.equal((await A.get('/api/admin/bikes')).body.data.find((b) => b.bikeId === 1).status, 'missing');

  // Bike 1 is back at the stand.
  const back = await request(app).post('/api/device/camera').set(DEVICE).send({ bikesPresent: [1, 2], timestamp: new Date(later.getTime() + 60000) }).expect(200);
  assert.equal(back.body.recovered, 1);
  assert.equal((await A.get('/api/admin/alerts?resolved=false')).body.data.length, 0);
  assert.ok(bikes.length === 2);
});

test('camera: a rented bike seen at the stand raises a returned_manually alert, cleared by a proper return', async () => {
  await scan('04A1B2C3').expect(201); // bike 1 rented
  const frame = await request(app)
    .post('/api/device/camera')
    .set(DEVICE)
    .send({ bikesPresent: [1, 2], timestamp: new Date() })
    .expect(200);
  assert.equal(frame.body.manualReturnsFlagged, 1);

  const open = (await A.get('/api/admin/alerts?resolved=false')).body.data;
  assert.equal(open[0].type, 'returned_manually');

  await scan('04A1B2C3').expect(200); // rider taps to return
  assert.equal((await A.get('/api/admin/alerts?resolved=false')).body.data.length, 0);
});

test('heartbeat marks a ground station online', async () => {
  await request(app).post('/api/device/heartbeat').set(DEVICE).send({ deviceId: 'stand-01', name: 'Main Gate', location: 'Gate' }).expect(200);
  const devices = (await A.get('/api/admin/devices').expect(200)).body.data;
  assert.equal(devices[0].online, true);
});

test('admin: bike and user CRUD, alert resolve, delete guards', async () => {
  const created = await A.post('/api/admin/bikes').send({ bikeId: 9, bikeName: 'Spare' }).expect(201);
  await A.post('/api/admin/bikes').send({ bikeId: 9 }).expect(409);
  await A.patch(`/api/admin/bikes/${created.body.data._id}`).send({ status: 'maintenance' }).expect(200);
  await A.patch(`/api/admin/bikes/${created.body.data._id}`).send({ status: 'flying' }).expect(400);
  await A.delete(`/api/admin/bikes/${created.body.data._id}`).expect(200);

  await scan('04A1B2C3').expect(201);
  const rentedBike = (await A.get('/api/admin/bikes')).body.data.find((b) => b.status === 'rented');
  await A.delete(`/api/admin/bikes/${rentedBike._id}`).expect(400);
  const aarav = (await A.get('/api/admin/users')).body.data.find((u) => u.name === 'Aarav');
  await A.delete(`/api/admin/users/${aarav._id}`).expect(400);

  const alert = await A.post('/api/admin/alerts').send({ bikeId: rentedBike._id, type: 'other', message: 'Flat tyre' }).expect(201);
  const resolved = await A.patch(`/api/admin/alerts/${alert.body.data._id}/resolve`).expect(200);
  assert.equal(resolved.body.data.isResolved, true);

  const rentals = (await A.get('/api/admin/rentals')).body.data;
  assert.equal(rentals[0].userId.name, 'Aarav');
  assert.equal(rentals[0].bikeId.bikeId, rentedBike.bikeId);
});

test('legacy /rent and /return endpoints still work', async () => {
  const rent = await request(app).post('/rent').set(DEVICE).send({ rfidTag: '04A1B2C3' }).expect(201);
  assert.equal(rent.body.bike.status, 'rented');
  await request(app).post('/return').set(DEVICE).send({ rfidTag: '04A1B2C3' }).expect(200);
});

test('admin API refuses requests without a valid session', async () => {
  await request(app).get('/api/admin/dashboard/stats').expect(401);
  await request(app).get('/api/admin/users').set({ Authorization: 'Bearer not-a-token' }).expect(401);
  const { signToken } = require('../src/middleware/auth');
  const forged = signToken({ sub: 'x', role: 'admin' }, 'a-different-secret-that-is-32-characters', 3600);
  await request(app).get('/api/admin/users').set({ Authorization: `Bearer ${forged}` }).expect(401);
  const expired = signToken({ sub: 'x', role: 'admin' }, process.env.JWT_SECRET, -10);
  await request(app).get('/api/admin/users').set({ Authorization: `Bearer ${expired}` }).expect(401);
  const me = await A.get('/api/admin/auth/me').expect(200);
  assert.equal(me.body.data.email, 'admin@test.local');
});

test('admin login rejects wrong credentials and rate-limits repeated failures', async () => {
  const { resetLoginLimiter } = require('../src/middleware/auth');
  resetLoginLimiter();
  await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'wrong' }).expect(401);
  await request(app).post('/api/admin/auth/login').send({ email: 'someone@else', password: 'correct horse battery' }).expect(401);
  for (let i = 0; i < 3; i++) await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'nope' });
  await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'correct horse battery' }).expect(429);
  resetLoginLimiter();
  const ok = await request(app).post('/api/admin/auth/login').send({ email: 'ADMIN@test.local', password: 'correct horse battery' }).expect(200);
  assert.ok(ok.body.data.token);
});

test('a hashed admin password works and the plain one is then ignored', async () => {
  const { hashPassword, resetLoginLimiter } = require('../src/middleware/auth');
  resetLoginLimiter();
  process.env.ADMIN_PASSWORD_HASH = hashPassword('a much better passphrase');
  try {
    await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'correct horse battery' }).expect(401);
    await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'a much better passphrase' }).expect(200);
  } finally {
    delete process.env.ADMIN_PASSWORD_HASH;
    resetLoginLimiter();
  }
});

test('in production the device API is closed when DEVICE_API_KEY is missing', async () => {
  const key = process.env.DEVICE_API_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.DEVICE_API_KEY;
  try {
    await request(app).post('/api/device/heartbeat').send({ deviceId: 'stand-x' }).expect(503);
  } finally {
    process.env.NODE_ENV = 'test';
    process.env.DEVICE_API_KEY = key;
  }
});
