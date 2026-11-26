const express = require('express');
const { body } = require('express-validator');
const flow = require('../services/flow');
const { deviceAuth } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Endpoints called by the ground station (the computer next to the bike stand).
 * Mounted at /api/device. Legacy aliases (/rent, /return, /camera/update-status) are mounted in server.js.
 */
const router = express.Router();
router.use(deviceAuth);

const present = (result) => ({
  success: true,
  action: result.action,
  message: result.message,
  user: { id: result.user._id, name: result.user.name, rfidTag: result.user.rfidTag },
  bike: result.bike,
  rental: result.rental,
});

const rfidRule = body('rfidTag').notEmpty().withMessage('RFID tag is required');

const rentHandler = asyncHandler(async (req, res) => {
  const result = await flow.rent(req.body.rfidTag, req.body.deviceId);
  res.status(201).json(present(result));
});

const returnHandler = asyncHandler(async (req, res) => {
  const result = await flow.giveBack(req.body.rfidTag, req.body.deviceId);
  res.json(present(result));
});

const cameraHandler = asyncHandler(async (req, res) => {
  const summary = await flow.processCameraFrame(req.body);
  res.json({ success: true, message: 'Camera status updated successfully', ...summary });
});

// One reader, one endpoint: rents when the rider has no ride, returns when they do.
router.post(
  '/scan',
  rfidRule,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const result = await flow.scan(req.body.rfidTag, req.body.deviceId);
    res.status(result.action === 'rent' ? 201 : 200).json(present(result));
  })
);
router.post('/rent', rfidRule, handleValidationErrors, rentHandler);
router.post('/return', rfidRule, handleValidationErrors, returnHandler);

router.post(
  '/camera',
  body('bikesPresent').isArray().withMessage('bikesPresent must be an array'),
  body('timestamp').notEmpty().withMessage('timestamp is required'),
  handleValidationErrors,
  cameraHandler
);

router.post(
  '/heartbeat',
  body('deviceId').notEmpty().withMessage('deviceId is required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const device = await flow.heartbeat(req.body);
    res.json({ success: true, message: 'Heartbeat received', data: device });
  })
);

module.exports = router;
module.exports.handlers = { rentHandler, returnHandler, cameraHandler, rfidRule };
