const mongoose = require('mongoose');

const BikeSchema = new mongoose.Schema(
  {
    bikeId: { type: Number, required: true, unique: true },
    bikeName: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['available', 'rented', 'missing', 'maintenance'],
      default: 'available',
    },
    // Last time the AI camera saw this bike at the stand.
    lastSeenCameraTime: { type: Date, default: null },
    lastSeenLocation: { type: String, default: null },
    assignedRFID: { type: String, default: null },
    // Who has the bike right now (null when it is at the stand).
    currentRentedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bike', BikeSchema);
