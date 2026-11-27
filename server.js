require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/database');
const { errorHandler, asyncHandler } = require('./src/middleware/errorHandler');
const deviceRoutes = require('./src/routes/deviceRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();
app.disable('x-powered-by');
// Behind Vercel or another proxy, use the client IP for the login rate limit.
app.set('trust proxy', 1);

const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '1mb' }));

// Health check does not need the database.
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'velo-backend', timestamp: new Date() }));

// Connect lazily so the same app works as a long-running server and on serverless hosts.
app.use(
  asyncHandler(async (req, res, next) => {
    await connectDB();
    next();
  })
);

app.get('/', (req, res) =>
  res.json({
    service: 'Velo backend',
    docs: 'https://github.com/Gaurav-Soni24/velo-backend#readme',
    endpoints: ['POST /api/device/scan', 'POST /api/device/camera', 'POST /api/device/heartbeat', 'GET /api/admin/dashboard/stats'],
  })
);

// Ground station (Arduino + RFID + camera computer)  ->  cloud
app.use('/api/device', deviceRoutes);
// Admin dashboard  ->  cloud
app.use('/api/admin', adminRoutes);

// Legacy aliases kept for older clients and the original README examples.
const { handlers } = deviceRoutes;
const { deviceAuth } = require('./src/middleware/auth');
const { handleValidationErrors } = require('./src/middleware/validation');
app.post('/rent', deviceAuth, handlers.rfidRule, handleValidationErrors, handlers.rentHandler);
app.post('/return', deviceAuth, handlers.rfidRule, handleValidationErrors, handlers.returnHandler);
app.post('/camera/update-status', deviceAuth, handlers.cameraHandler);

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found', error: 'Route not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Velo backend listening on port ${PORT}`)))
    .catch((error) => {
      console.error('MongoDB connection error:', error.message);
      process.exit(1);
    });
}

module.exports = app;
