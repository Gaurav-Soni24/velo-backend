const User = require('../models/User');
const Bike = require('../models/Bike');
const Rental = require('../models/Rental');
const Alert = require('../models/Alert');
const { BIKE_STATUS, RENTAL_STATUS, ALERT_TYPES } = require('../utils/constants');

// POST /rent - Rent a bike using RFID
exports.rentBike = async (req, res, next) => {
  try {
    const { rfidTag } = req.body;

    if (!rfidTag) {
      const error = new Error('RFID tag is required');
      error.statusCode = 400;
      throw error;
    }

    // Find user by RFID
    const user = await User.findOne({ rfidTag });
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Check for ongoing rental
    const ongoingRental = await Rental.findOne({
      userId: user._id,
      status: RENTAL_STATUS.ONGOING,
    });

    if (ongoingRental) {
      const error = new Error('User has an ongoing rental');
      error.statusCode = 400;
      throw error;
    }

    // Find available bike
    const availableBike = await Bike.findOne({ status: BIKE_STATUS.AVAILABLE });
    if (!availableBike) {
      const error = new Error('No available bikes');
      error.statusCode = 404;
      throw error;
    }

    // Create rental
    const rental = new Rental({
      userId: user._id,
      bikeId: availableBike._id,
      status: RENTAL_STATUS.ONGOING,
    });
    await rental.save();

    // Mark bike as rented
    availableBike.status = BIKE_STATUS.RENTED;
    await availableBike.save();

    res.status(201).json({
      message: 'Bike rented successfully',
      rental,
      bike: availableBike,
    });
  } catch (error) {
    next(error);
  }
};

// POST /return - Return a rented bike using RFID
exports.returnBike = async (req, res, next) => {
  try {
    const { rfidTag } = req.body;

    if (!rfidTag) {
      const error = new Error('RFID tag is required');
      error.statusCode = 400;
      throw error;
    }

    // Find user by RFID
    const user = await User.findOne({ rfidTag });
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Find ongoing rental
    const rental = await Rental.findOne({
      userId: user._id,
      status: RENTAL_STATUS.ONGOING,
    }).populate('bikeId');

    if (!rental) {
      const error = new Error('No ongoing rental found');
      error.statusCode = 404;
      throw error;
    }

    // Mark rental as completed
    rental.endTime = new Date();
    rental.status = RENTAL_STATUS.COMPLETED;
    await rental.save();

    // Mark bike as available
    const bike = rental.bikeId;
    bike.status = BIKE_STATUS.AVAILABLE;
    bike.lastSeenLocation = null;
    await bike.save();

    res.json({
      message: 'Bike returned successfully',
      rental,
      bike,
    });
  } catch (error) {
    next(error);
  }
};
