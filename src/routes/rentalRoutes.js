const express = require('express');
const { body } = require('express-validator');
const rentalController = require('../controllers/rentalController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// POST /rent
router.post(
  '/rent',
  body('rfidTag').notEmpty().withMessage('RFID tag is required'),
  handleValidationErrors,
  rentalController.rentBike
);

// POST /return
router.post(
  '/return',
  body('rfidTag').notEmpty().withMessage('RFID tag is required'),
  handleValidationErrors,
  rentalController.returnBike
);

module.exports = router;
