/**
 * Demo data so the admin panel and the ground station simulator work immediately.
 *   npm run seed            add missing demo users, bikes and a ground station
 *   npm run seed -- --reset wipe every collection first
 */
require('dotenv').config();
const connectDB = require('../src/config/database');
const User = require('../src/models/User');
const Bike = require('../src/models/Bike');
const Rental = require('../src/models/Rental');
const Alert = require('../src/models/Alert');
const ScanEvent = require('../src/models/ScanEvent');
const Device = require('../src/models/Device');

const users = [
  { name: 'Aarav Sharma', rollNumber: 'CSE2201', branch: 'CSE', semester: 7, rfidTag: '04A1B2C3' },
  { name: 'Diya Verma', rollNumber: 'ECE2214', branch: 'ECE', semester: 5, rfidTag: '04D4E5F6' },
  { name: 'Rohan Patel', rollNumber: 'ME2230', branch: 'ME', semester: 3, rfidTag: '04112233' },
  { name: 'Ananya Singh', rollNumber: 'IT2205', branch: 'IT', semester: 7, rfidTag: '04445566' },
  { name: 'Kabir Das', rollNumber: 'CE2241', branch: 'CE', semester: 1, rfidTag: '04778899' },
];

const bikes = [1, 2, 3, 4, 5].map((n) => ({ bikeId: n, bikeName: `Velo ${n}`, lastSeenLocation: 'Main Gate Stand' }));

const seed = async ({ reset = false } = {}) => {
  await connectDB();

  if (reset) {
    await Promise.all([User, Bike, Rental, Alert, ScanEvent, Device].map((m) => m.deleteMany({})));
    console.log('Collections cleared');
  }

  for (const u of users) await User.updateOne({ rfidTag: u.rfidTag }, { $setOnInsert: u }, { upsert: true });
  for (const b of bikes) await Bike.updateOne({ bikeId: b.bikeId }, { $setOnInsert: b }, { upsert: true });
  await Device.updateOne(
    { deviceId: 'stand-01' },
    { $setOnInsert: { deviceId: 'stand-01', name: 'Main Gate Stand', location: 'Campus main gate' } },
    { upsert: true }
  );

  console.log(`Seeded ${users.length} users, ${bikes.length} bikes and 1 ground station.`);
  console.log('Demo RFID cards:', users.map((u) => `${u.name}=${u.rfidTag}`).join(', '));
};

module.exports = seed;

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
