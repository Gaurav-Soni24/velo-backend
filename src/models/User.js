const mongoose = require('mongoose');

// A rider. The RFID card is the only credential the ground station ever sends.
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rollNumber: { type: String, trim: true, unique: true, sparse: true },
    branch: { type: String, default: 'CSE', trim: true },
    semester: { type: Number, default: 1, min: 1, max: 12 },
    rfidTag: { type: String, required: true, unique: true, trim: true, uppercase: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
