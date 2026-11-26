const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.code === 11000) {
    statusCode = 409;
    message = `Already exists: ${Object.keys(err.keyPattern || {}).join(', ') || 'duplicate value'}`;
  }

  if (statusCode >= 500) console.error('Error:', err);

  // `error` is kept for older clients; `success`/`message` is what the admin panel reads.
  res.status(statusCode).json({
    success: false,
    message,
    error: message,
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
};

module.exports = { errorHandler, asyncHandler, httpError };
