/**
 * Core business flow of Velo.
 *
 *   RFID card tap  ->  ground station  ->  POST /api/device/scan  ->  rent() / giveBack()
 *   Camera frame   ->  ground station  ->  POST /api/device/camera ->  processCameraFrame()
 *
 * RFID tells us what the *system thinks* happened; the camera tells us what is *physically*
 * at the stand. Reconciling the two is what produces alerts.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Bike = require('../models/Bike');
const Rental = require('../models/Rental');
const Alert = require('../models/Alert');
const ScanEvent = require('../models/ScanEvent');
const Device = require('../models/Device');
const { httpError } = require('../middleware/errorHandler');
const {
  BIKE_STATUS,
  RENTAL_STATUS,
  ALERT_TYPES,
  SCAN_ACTIONS,
  MISSING_BIKE_TIMEOUT_MINUTES,
} = require('../utils/constants');

const normaliseTag = (tag) => String(tag || '').trim().toUpperCase();

const logScan = async ({ rfidTag, action, success, message, user, bike, deviceId }) => {
  try {
    await ScanEvent.create({
      rfidTag: rfidTag || null,
      action,
      success,
      message,
      userName: user ? user.name : null,
      bikeNumber: bike ? bike.bikeId : null,
      deviceId: deviceId || null,
    });
  } catch (error) {
    // Logging must never break a ride.
    console.error('Failed to write scan event:', error.message);
  }
};

const reject = async (ctx, status, message) => {
  await logScan({ ...ctx, success: false, message });
  throw httpError(status, message);
};

/** Rent: find the rider by card and hand them the first available bike. */
const rent = async (rawTag, deviceId) => {
  const rfidTag = normaliseTag(rawTag);
  const ctx = { rfidTag, action: SCAN_ACTIONS.RENT, deviceId };
  if (!rfidTag) throw httpError(400, 'RFID tag is required');

  const user = await User.findOne({ rfidTag });
  if (!user) await reject(ctx, 404, 'User not found');
  ctx.user = user;
  if (!user.isActive) await reject(ctx, 403, 'User account is disabled');

  const ongoing = await Rental.findOne({ userId: user._id, status: RENTAL_STATUS.ONGOING });
  if (ongoing) await reject(ctx, 400, 'User has an ongoing rental');

  // Atomic claim: two riders tapping at the same moment can never get the same bike.
  const bike = await Bike.findOneAndUpdate(
    { status: BIKE_STATUS.AVAILABLE },
    { status: BIKE_STATUS.RENTED, currentRentedBy: user._id },
    { new: true, sort: { bikeId: 1 } }
  );
  if (!bike) await reject(ctx, 404, 'No available bikes');

  let rental;
  try {
    rental = await Rental.create({ userId: user._id, bikeId: bike._id });
  } catch (error) {
    // Roll back the claim so the bike is not stuck as "rented".
    await Bike.updateOne({ _id: bike._id }, { status: BIKE_STATUS.AVAILABLE, currentRentedBy: null });
    throw error;
  }

  const message = `Bike ${bike.bikeId} unlocked for ${user.name}`;
  await logScan({ ...ctx, bike, success: true, message });
  return { action: SCAN_ACTIONS.RENT, message, user, bike, rental };
};

/** Return: close the rider's ongoing rental and free the bike. */
const giveBack = async (rawTag, deviceId) => {
  const rfidTag = normaliseTag(rawTag);
  const ctx = { rfidTag, action: SCAN_ACTIONS.RETURN, deviceId };
  if (!rfidTag) throw httpError(400, 'RFID tag is required');

  const user = await User.findOne({ rfidTag });
  if (!user) await reject(ctx, 404, 'User not found');
  ctx.user = user;

  const rental = await Rental.findOne({ userId: user._id, status: RENTAL_STATUS.ONGOING });
  if (!rental) await reject(ctx, 404, 'No ongoing rental found');

  const now = new Date();
  rental.endTime = now;
  rental.status = RENTAL_STATUS.COMPLETED;
  rental.duration = Math.max(1, Math.round((now - rental.startTime) / 60000));
  await rental.save();

  const bike = await Bike.findByIdAndUpdate(
    rental.bikeId,
    { status: BIKE_STATUS.AVAILABLE, currentRentedBy: null, lastSeenCameraTime: now },
    { new: true }
  );

  // If the camera had already noticed the bike back at the stand, that alert is now explained.
  await Alert.updateMany(
    { bikeId: rental.bikeId, type: ALERT_TYPES.RETURNED_MANUALLY, isResolved: false },
    { isResolved: true, resolvedAt: now }
  );

  const message = `Bike ${bike ? bike.bikeId : '?'} returned by ${user.name} after ${rental.duration} min`;
  await logScan({ ...ctx, bike, success: true, message });
  return { action: SCAN_ACTIONS.RETURN, message, user, bike, rental };
};

/** One reader at the stand: a tap rents if the rider has no ride, and returns if they do. */
const scan = async (rawTag, deviceId) => {
  const rfidTag = normaliseTag(rawTag);
  if (!rfidTag) throw httpError(400, 'RFID tag is required');
  const user = await User.findOne({ rfidTag });
  if (user) {
    const ongoing = await Rental.exists({ userId: user._id, status: RENTAL_STATUS.ONGOING });
    if (ongoing) return giveBack(rfidTag, deviceId);
  }
  return rent(rfidTag, deviceId);
};

const raiseAlert = async (bike, type, message, at) => {
  const existing = await Alert.findOne({ bikeId: bike._id, type, isResolved: false });
  if (existing) return false;
  await Alert.create({ bikeId: bike._id, type, message, timestamp: at });
  return true;
};

/**
 * Camera reconciliation. `bikesPresent` lists the bikes the camera currently sees at the stand
 * (human bike numbers like 3, or Mongo ids).
 */
const processCameraFrame = async ({ bikesPresent, timestamp, deviceId }) => {
  if (!Array.isArray(bikesPresent)) throw httpError(400, 'bikesPresent must be an array');
  const at = new Date(timestamp);
  if (!timestamp || Number.isNaN(at.getTime())) throw httpError(400, 'A valid timestamp is required');

  const presentNumbers = new Set();
  const presentIds = new Set();
  for (const item of bikesPresent) {
    if (typeof item === 'number' || /^\d+$/.test(String(item))) presentNumbers.add(Number(item));
    else if (mongoose.isValidObjectId(item)) presentIds.add(String(item));
  }

  const threshold = new Date(at.getTime() - MISSING_BIKE_TIMEOUT_MINUTES * 60000);
  const summary = { bikesSeen: 0, recovered: 0, missingFlagged: 0, manualReturnsFlagged: 0 };

  const bikes = await Bike.find();
  for (const bike of bikes) {
    const seen = presentNumbers.has(bike.bikeId) || presentIds.has(String(bike._id));

    if (seen) {
      summary.bikesSeen += 1;
      bike.lastSeenCameraTime = at;

      if (bike.status === BIKE_STATUS.MISSING) {
        // It came back: clear the missing state and the open alert.
        bike.status = BIKE_STATUS.AVAILABLE;
        summary.recovered += 1;
        await Alert.updateMany(
          { bikeId: bike._id, type: ALERT_TYPES.MISSING_MISMATCH, isResolved: false },
          { isResolved: true, resolvedAt: at }
        );
      } else if (bike.status === BIKE_STATUS.RENTED) {
        // Camera sees a "rented" bike at the stand: the rider parked it without tapping their card.
        const created = await raiseAlert(
          bike,
          ALERT_TYPES.RETURNED_MANUALLY,
          `Bike ${bike.bikeId} is marked as rented but the camera sees it at the stand (not returned with RFID)`,
          at
        );
        if (created) summary.manualReturnsFlagged += 1;
      }
      await bike.save();
    } else if (bike.status === BIKE_STATUS.AVAILABLE) {
      const lastSeen = bike.lastSeenCameraTime || bike.createdAt;
      if (lastSeen && lastSeen < threshold) {
        const created = await raiseAlert(
          bike,
          ALERT_TYPES.MISSING_MISMATCH,
          `Bike ${bike.bikeId} should be at the stand but has not been seen by the camera for ${MISSING_BIKE_TIMEOUT_MINUTES} minutes`,
          at
        );
        if (created) {
          bike.status = BIKE_STATUS.MISSING;
          await bike.save();
          summary.missingFlagged += 1;
        }
      }
    }
  }

  if (deviceId) {
    await Device.findOneAndUpdate(
      { deviceId },
      { lastHeartbeat: new Date(), lastEvent: `camera: ${summary.bikesSeen} bike(s) seen` },
      { upsert: true }
    );
  }
  return summary;
};

/** Ground station "I am alive" ping, shown as online/offline in the admin panel. */
const heartbeat = async ({ deviceId, name, location }) => {
  if (!deviceId) throw httpError(400, 'deviceId is required');
  const update = { lastHeartbeat: new Date() };
  if (name) update.name = name;
  if (location) update.location = location;
  return Device.findOneAndUpdate({ deviceId }, update, { upsert: true, new: true });
};

module.exports = { rent, giveBack, scan, processCameraFrame, heartbeat };
