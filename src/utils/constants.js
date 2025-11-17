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
  MISSING_MISMATCH: 'missing_mismatch',
  RETURNED_MANUALLY: 'returned_manually',
  CAMERA_ISSUE: 'camera_issue',
};

const MISSING_BIKE_TIMEOUT_MINUTES = parseInt(process.env.MISSING_BIKE_TIMEOUT_MINUTES) || 10;

module.exports = {
  BIKE_STATUS,
  RENTAL_STATUS,
  ALERT_TYPES,
  MISSING_BIKE_TIMEOUT_MINUTES,
};
