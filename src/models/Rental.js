const mongoose = require('mongoose');

const RentalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bikeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bike', required: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    status: { type: String, enum: ['ongoing', 'completed'], default: 'ongoing', index: true },
    // Minutes, filled in when the bike is returned.
    duration: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Rental', RentalSchema);
