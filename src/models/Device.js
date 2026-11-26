const mongoose = require('mongoose');

// A ground station (the computer next to the bike stand with the Arduino + RFID reader + camera).
const DeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: '' },
    location: { type: String, default: '' },
    lastHeartbeat: { type: Date, default: null },
    lastEvent: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Device', DeviceSchema);
