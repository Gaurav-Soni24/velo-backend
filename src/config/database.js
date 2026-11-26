const mongoose = require('mongoose');

let pending = null;

// Safe to call many times: reuses the live connection (also works on serverless hosts).
const connectDB = async (uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bike-rental-iot') => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!pending) {
    pending = mongoose
      .connect(uri)
      .then((m) => {
        console.log('MongoDB connected');
        return m.connection;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
};

module.exports = connectDB;
