const express = require('express');
const { body } = require('express-validator');
const cameraController = require('../controllers/cameraController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// POST /camera/update-status
router.post(
  '/update-status',
  body('bikesPresent').isArray().withMessage('bikesPresent must be an array'),
  body('timestamp').notEmpty().withMessage('timestamp is required'),
  handleValidationErrors,
  cameraController.updateCameraStatus
);

module.exports = router;
