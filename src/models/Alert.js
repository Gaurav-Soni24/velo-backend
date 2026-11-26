const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema(
  {
    bikeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bike', required: true },
    type: {
      type: String,
      enum: ['missing_mismatch', 'returned_manually', 'camera_issue', 'other'],
      required: true,
    },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    videoUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    isResolved: { type: Boolean, default: false, index: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', AlertSchema);
