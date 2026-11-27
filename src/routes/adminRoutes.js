const express = require('express');
const { body } = require('express-validator');
const admin = require('../controllers/adminController');
const { adminAuth, login } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

/** Admin API used by the admin dashboard. Mounted at /api/admin. */
const router = express.Router();

// Sign in is the only admin route that works without a token.
router.post('/auth/login', login);
router.use(adminAuth);
router.get('/auth/me', (req, res) => res.json({ success: true, data: { email: req.admin.sub, role: req.admin.role } }));

const h = asyncHandler;
const ALERT_TYPES = ['missing_mismatch', 'returned_manually', 'camera_issue', 'other'];

router.get('/dashboard/stats', h(admin.getStats));
router.get('/events', h(admin.getEvents));
router.get('/devices', h(admin.getDevices));

router.get('/bikes', h(admin.getBikes));
router.post(
  '/bikes',
  body('bikeId').isInt({ min: 1 }).withMessage('bikeId must be a positive integer'),
  handleValidationErrors,
  h(admin.createBike)
);
router.patch('/bikes/:id', h(admin.updateBike));
router.delete('/bikes/:id', h(admin.deleteBike));

router.get('/users', h(admin.getUsers));
router.post(
  '/users',
  body('name').trim().notEmpty().withMessage('name is required'),
  body('rfidTag').trim().notEmpty().withMessage('rfidTag is required'),
  handleValidationErrors,
  h(admin.createUser)
);
router.patch('/users/:id', h(admin.updateUser));
router.delete('/users/:id', h(admin.deleteUser));

router.get('/rentals', h(admin.getRentals));

router.get('/alerts', h(admin.getAlerts));
router.post(
  '/alerts',
  body('bikeId').notEmpty().withMessage('bikeId is required'),
  body('type').isIn(ALERT_TYPES).withMessage('Invalid alert type'),
  body('message').trim().notEmpty().withMessage('message is required'),
  handleValidationErrors,
  h(admin.createAlert)
);
router.patch('/alerts/:id/resolve', h(admin.resolveAlert));

module.exports = router;
