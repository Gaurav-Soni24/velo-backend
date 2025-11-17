const Bike = require('../models/Bike');
const Alert = require('../models/Alert');
const { BIKE_STATUS, ALERT_TYPES, MISSING_BIKE_TIMEOUT_MINUTES } = require('../utils/constants');

// POST /camera/update-status - Update bike status from camera
exports.updateCameraStatus = async (req, res, next) => {
  try {
    const { bikesPresent, timestamp } = req.body;

    if (!bikesPresent || !Array.isArray(bikesPresent) || !timestamp) {
      const error = new Error('bikesPresent (array) and timestamp are required');
      error.statusCode = 400;
      throw error;
    }

    const updateTime = new Date(timestamp);

    // Update all detected bikes
    for (const bikeObjectId of bikesPresent) {
      const bike = await Bike.findById(bikeObjectId);
      if (bike) {
        bike.lastSeenCameraTime = updateTime;
        await bike.save();
      }
    }

    // Check for missing bikes
    const timeoutThreshold = new Date(updateTime.getTime() - MISSING_BIKE_TIMEOUT_MINUTES * 60000);

    const rentedBikes = await Bike.find({
      status: BIKE_STATUS.RENTED,
      lastSeenCameraTime: { $lt: timeoutThreshold },
    });

    for (const bike of rentedBikes) {
      // Check if an alert already exists
      const existingAlert = await Alert.findOne({
        bikeId: bike._id,
        type: ALERT_TYPES.MISSING_MISMATCH,
        resolved: false,
      });

      if (!existingAlert) {
        const alert = new Alert({
          bikeId: bike._id,
          type: ALERT_TYPES.MISSING_MISMATCH,
          message: `Bike ${bike.bikeId} marked as rented but not detected by camera for ${MISSING_BIKE_TIMEOUT_MINUTES} minutes`,
          timestamp: updateTime,
        });
        await alert.save();

        bike.status = BIKE_STATUS.MISSING;
        await bike.save();
      }
    }

    res.json({
      message: 'Camera status updated successfully',
      bikesUpdated: bikesPresent.length,
      alertsCreated: rentedBikes.length,
    });
  } catch (error) {
    next(error);
  }
};
