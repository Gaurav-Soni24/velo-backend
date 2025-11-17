const express = require('express');
const { body, query } = require('express-validator');
const adminController = require('../controllers/adminController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// POST /admin/bike/add
router.post(
  '/bike/add',
  body('bikeId').isInt().withMessage('bikeId must be an integer'),
  handleValidationErrors,
  adminController.addBike
);

// GET /admin/bike/all
router.get('/bike/all', adminController.getAllBikes);

// PATCH /admin/bike/update/:id
router.patch('/bike/update/:id', adminController.updateBike);

// GET /admin/rentals
router.get('/rentals', adminController.getRentals);

// GET /admin/alerts
router.get('/alerts', adminController.getAlerts);

// POST /admin/alert/manual
router.post(
  '/alert/manual',
  body('bikeId').notEmpty().withMessage('bikeId is required'),
  body('type').isIn(['missing_mismatch', 'returned_manually', 'camera_issue']).withMessage('Invalid alert type'),
  body('message').notEmpty().withMessage('message is required'),
  handleValidationErrors,
  adminController.createManualAlert
);

module.exports = router;
