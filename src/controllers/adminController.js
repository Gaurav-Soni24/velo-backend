const Bike = require('../models/Bike');
const Rental = require('../models/Rental');
const Alert = require('../models/Alert');
const { BIKE_STATUS, ALERT_TYPES } = require('../utils/constants');

// POST /admin/bike/add - Add a new bike
exports.addBike = async (req, res, next) => {
  try {
    const { bikeId, assignedRFID, lastSeenLocation } = req.body;

    if (!bikeId) {
      const error = new Error('bikeId is required');
      error.statusCode = 400;
      throw error;
    }

    const existingBike = await Bike.findOne({ bikeId });
    if (existingBike) {
      const error = new Error('Bike with this ID already exists');
      error.statusCode = 400;
      throw error;
    }

    const bike = new Bike({
      bikeId,
      status: BIKE_STATUS.AVAILABLE,
      assignedRFID: assignedRFID || null,
      lastSeenLocation: lastSeenLocation || null,
    });

    await bike.save();
    res.status(201).json({ message: 'Bike added successfully', bike });
  } catch (error) {
    next(error);
  }
};

// GET /admin/bike/all - Get all bikes
exports.getAllBikes = async (req, res, next) => {
  try {
    const bikes = await Bike.find();
    res.json({ bikes, total: bikes.length });
  } catch (error) {
    next(error);
  }
};

// PATCH /admin/bike/update/:id - Update bike details
exports.updateBike = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const bike = await Bike.findByIdAndUpdate(id, updates, { new: true });

    if (!bike) {
      const error = new Error('Bike not found');
      error.statusCode = 404;
      throw error;
    }

    res.json({ message: 'Bike updated successfully', bike });
  } catch (error) {
    next(error);
  }
};

// GET /admin/rentals - Get all rentals
exports.getRentals = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const rentals = await Rental.find(query)
      .populate('userId', 'name rfidTag')
      .populate('bikeId', 'bikeId status');

    res.json({ rentals, total: rentals.length });
  } catch (error) {
    next(error);
  }
};

// GET /admin/alerts - Get all alerts
exports.getAlerts = async (req, res, next) => {
  try {
    const { resolved } = req.query;
    const query = resolved !== undefined ? { resolved: resolved === 'true' } : {};

    const alerts = await Alert.find(query)
      .populate('bikeId', 'bikeId status')
      .sort({ timestamp: -1 });

    res.json({ alerts, total: alerts.length });
  } catch (error) {
    next(error);
  }
};

// POST /admin/alert/manual - Create a manual alert
exports.createManualAlert = async (req, res, next) => {
  try {
    const { bikeId, type, message, imageUrl, videoUrl } = req.body;

    if (!bikeId || !type || !message) {
      const error = new Error('bikeId, type, and message are required');
      error.statusCode = 400;
      throw error;
    }

    const bike = await Bike.findById(bikeId);
    if (!bike) {
      const error = new Error('Bike not found');
      error.statusCode = 404;
      throw error;
    }

    const alert = new Alert({
      bikeId,
      type,
      message,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
    });

    await alert.save();
    res.status(201).json({ message: 'Alert created successfully', alert });
  } catch (error) {
    next(error);
  }
};
