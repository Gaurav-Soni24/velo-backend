const mongoose = require('mongoose');

const BikeSchema = new mongoose.Schema(
  {
    bikeId: {
      type: Number,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['available', 'rented', 'missing', 'maintenance'],
      default: 'available',
    },
    lastSeenCameraTime: {
      type: Date,
      default: null,
    },
    lastSeenLocation: {
      type: String,
      default: null,
    },
    assignedRFID: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bike', BikeSchema);
