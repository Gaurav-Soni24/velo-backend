const BIKE_STATUS = {
  AVAILABLE: 'available',
  RENTED: 'rented',
  MISSING: 'missing',
  MAINTENANCE: 'maintenance',
};

const RENTAL_STATUS = {
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
};

const ALERT_TYPES = {
  // Bike should be at the stand (status "available") but the camera cannot see it.
  MISSING_MISMATCH: 'missing_mismatch',
  // Camera sees a bike at the stand that the system still thinks is rented.
  RETURNED_MANUALLY: 'returned_manually',
  // Camera / ground station stopped reporting.
  CAMERA_ISSUE: 'camera_issue',
  OTHER: 'other',
};

const SCAN_ACTIONS = {
  RENT: 'rent',
  RETURN: 'return',
};

// A bike that is "available" but not seen by the camera for this long is flagged as missing.
const MISSING_BIKE_TIMEOUT_MINUTES = parseInt(process.env.MISSING_BIKE_TIMEOUT_MINUTES, 10) || 10;

// A ground station that has not sent a heartbeat for this long is shown as offline.
const DEVICE_OFFLINE_AFTER_SECONDS = parseInt(process.env.DEVICE_OFFLINE_AFTER_SECONDS, 10) || 90;

module.exports = {
  BIKE_STATUS,
  RENTAL_STATUS,
  ALERT_TYPES,
  SCAN_ACTIONS,
  MISSING_BIKE_TIMEOUT_MINUTES,
  DEVICE_OFFLINE_AFTER_SECONDS,
};
