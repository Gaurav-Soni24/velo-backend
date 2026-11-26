const { validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array();
    return res.status(400).json({
      success: false,
      message: list.map((e) => e.msg).join(', '),
      error: list[0].msg,
      errors: list,
    });
  }
  next();
};

module.exports = { handleValidationErrors };
