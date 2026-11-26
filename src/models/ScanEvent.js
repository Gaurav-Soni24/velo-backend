const mongoose = require('mongoose');

// Audit log of every card tap the ground station forwards, successful or not.
// The admin panel shows this as the live activity feed.
const ScanEventSchema = new mongoose.Schema(
  {
    rfidTag: { type: String, default: null },
    action: { type: String, enum: ['rent', 'return'], required: true },
    success: { type: Boolean, required: true },
    message: { type: String, required: true },
    userName: { type: String, default: null },
    bikeNumber: { type: Number, default: null },
    deviceId: { type: String, default: null },
  },
  { timestamps: true }
);

ScanEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ScanEvent', ScanEventSchema);
