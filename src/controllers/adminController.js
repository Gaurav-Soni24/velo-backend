const User = require('../models/User');
const Bike = require('../models/Bike');
const Rental = require('../models/Rental');
const Alert = require('../models/Alert');
const ScanEvent = require('../models/ScanEvent');
const Device = require('../models/Device');
const { httpError } = require('../middleware/errorHandler');
const { BIKE_STATUS, RENTAL_STATUS, DEVICE_OFFLINE_AFTER_SECONDS } = require('../utils/constants');

const ok = (res, data, extra = {}, status = 200) => res.status(status).json({ success: true, data, ...extra });

const RIDER_FIELDS = 'name rollNumber branch semester rfidTag';

/* ---------------------------------- dashboard ---------------------------------- */

exports.getStats = async (req, res) => {
  const [total, available, rented, maintenance, missing, users, activeUsers, ongoing, completed, unresolved] =
    await Promise.all([
      Bike.countDocuments(),
      Bike.countDocuments({ status: BIKE_STATUS.AVAILABLE }),
      Bike.countDocuments({ status: BIKE_STATUS.RENTED }),
      Bike.countDocuments({ status: BIKE_STATUS.MAINTENANCE }),
      Bike.countDocuments({ status: BIKE_STATUS.MISSING }),
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Rental.countDocuments({ status: RENTAL_STATUS.ONGOING }),
      Rental.countDocuments({ status: RENTAL_STATUS.COMPLETED }),
      Alert.countDocuments({ isResolved: false }),
    ]);

  ok(res, {
    bikes: { total, available, rented, maintenance, missing },
    users: { total: users, active: activeUsers },
    rentals: { ongoing, completed },
    alerts: { unresolved },
  });
};

exports.getEvents = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const events = await ScanEvent.find().sort({ createdAt: -1 }).limit(limit);
  ok(res, events);
};

exports.getDevices = async (req, res) => {
  const devices = await Device.find().sort({ deviceId: 1 }).lean();
  const now = Date.now();
  ok(
    res,
    devices.map((d) => ({
      ...d,
      online: !!d.lastHeartbeat && now - new Date(d.lastHeartbeat).getTime() < DEVICE_OFFLINE_AFTER_SECONDS * 1000,
    }))
  );
};

/* ------------------------------------ bikes ------------------------------------ */

exports.getBikes = async (req, res) => {
  const bikes = await Bike.find().populate('currentRentedBy', RIDER_FIELDS).sort({ bikeId: 1 });
  ok(res, bikes, { total: bikes.length });
};

exports.createBike = async (req, res) => {
  const { bikeId, bikeName, assignedRFID, lastSeenLocation } = req.body;
  const bike = await Bike.create({
    bikeId,
    bikeName: bikeName || `Velo ${bikeId}`,
    assignedRFID: assignedRFID || null,
    lastSeenLocation: lastSeenLocation || null,
  });
  ok(res, bike, { message: 'Bike added successfully' }, 201);
};

exports.updateBike = async (req, res) => {
  const allowed = ['bikeName', 'status', 'assignedRFID', 'lastSeenLocation'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (updates.status && !Object.values(BIKE_STATUS).includes(updates.status)) {
    throw httpError(400, 'Invalid bike status');
  }
  const bike = await Bike.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!bike) throw httpError(404, 'Bike not found');
  ok(res, bike, { message: 'Bike updated successfully' });
};

exports.deleteBike = async (req, res) => {
  const bike = await Bike.findById(req.params.id);
  if (!bike) throw httpError(404, 'Bike not found');
  if (bike.status === BIKE_STATUS.RENTED) throw httpError(400, 'Cannot delete a bike that is currently rented');
  await bike.deleteOne();
  ok(res, null, { message: 'Bike deleted successfully' });
};

/* ------------------------------------ users ------------------------------------ */

exports.getUsers = async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  ok(res, users, { total: users.length });
};

exports.createUser = async (req, res) => {
  const { name, rollNumber, branch, semester, rfidTag } = req.body;
  const user = await User.create({ name, rollNumber: rollNumber || undefined, branch, semester, rfidTag });
  ok(res, user, { message: 'User created successfully' }, 201);
};

exports.updateUser = async (req, res) => {
  const allowed = ['name', 'rollNumber', 'branch', 'semester', 'rfidTag', 'isActive'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!user) throw httpError(404, 'User not found');
  ok(res, user, { message: 'User updated successfully' });
};

exports.deleteUser = async (req, res) => {
  const ongoing = await Rental.exists({ userId: req.params.id, status: RENTAL_STATUS.ONGOING });
  if (ongoing) throw httpError(400, 'Cannot delete a user with an ongoing rental');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  ok(res, null, { message: 'User deleted successfully' });
};

/* ----------------------------------- rentals ----------------------------------- */

exports.getRentals = async (req, res) => {
  const query = req.query.status ? { status: req.query.status } : {};
  const rentals = await Rental.find(query)
    .populate('userId', RIDER_FIELDS)
    .populate('bikeId', 'bikeId bikeName status')
    .sort({ startTime: -1 })
    .lean();

  const now = Date.now();
  const data = rentals.map((r) => ({
    ...r,
    // Ongoing rides show the running time.
    duration: r.duration != null ? r.duration : Math.max(1, Math.round((now - new Date(r.startTime).getTime()) / 60000)),
  }));
  ok(res, data, { total: data.length });
};

/* ----------------------------------- alerts ------------------------------------ */

exports.getAlerts = async (req, res) => {
  const query = req.query.resolved !== undefined ? { isResolved: req.query.resolved === 'true' } : {};
  const alerts = await Alert.find(query).populate('bikeId', 'bikeId bikeName').sort({ timestamp: -1 });
  ok(res, alerts, { total: alerts.length });
};

exports.createAlert = async (req, res) => {
  const { bikeId, type, message, imageUrl, videoUrl } = req.body;
  const bike = await Bike.findById(bikeId);
  if (!bike) throw httpError(404, 'Bike not found');
  const alert = await Alert.create({ bikeId, type, message, imageUrl: imageUrl || null, videoUrl: videoUrl || null });
  ok(res, alert, { message: 'Alert created successfully' }, 201);
};

exports.resolveAlert = async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(
    req.params.id,
    { isResolved: true, resolvedAt: new Date() },
    { new: true }
  );
  if (!alert) throw httpError(404, 'Alert not found');
  ok(res, alert, { message: 'Alert resolved successfully' });
};
