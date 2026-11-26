const crypto = require('crypto');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const keyGuard = (envName, headerName, label) => (req, res, next) => {
  const expected = process.env[envName];
  // No key configured: open (local development). Set the variable in production.
  if (!expected) return next();
  const provided = req.get(headerName);
  if (provided && safeEqual(provided, expected)) return next();
  return res.status(401).json({ success: false, message: `Invalid or missing ${label} key`, error: 'Unauthorized' });
};

// The ground station must send `x-device-key`.
const deviceAuth = keyGuard('DEVICE_API_KEY', 'x-device-key', 'device');
// Optional guard for the admin API (`x-admin-key`).
const adminAuth = keyGuard('ADMIN_API_KEY', 'x-admin-key', 'admin');

module.exports = { deviceAuth, adminAuth };
