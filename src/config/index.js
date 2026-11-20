const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  port: parseInt(process.env.PORT, 10) || 3000,
  dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'lablend.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  sessionSecret: process.env.SESSION_SECRET || 'lablend-dev-session-secret',
  jwtSecret: process.env.JWT_SECRET || 'lablend-dev-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  bcryptRounds: env === 'test' ? 4 : 10,
  holidays: {
    apiUrl: process.env.HOLIDAY_API_URL || 'https://date.nager.at/api/v3/PublicHolidays',
    countryCode: process.env.HOLIDAY_COUNTRY || 'BR',
    timeoutMs: parseInt(process.env.HOLIDAY_TIMEOUT_MS, 10) || 3000,
  },
  loans: {
    maxOpenLoansPerStudent: 3,
    minDays: 1,
    maxDays: 14,
    lateFeePerDayCents: 500,
    lateFeeCapCents: 10000,
  },
  auth: {
    minPasswordLength: 8,
    maxFailedLogins: 5,
    lockMinutes: 15,
  },
  upload: {
    maxBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    allowedExtensions: ['.jpg', '.jpeg', '.png'],
  },
  scheduler: {
    intervalMs: 60 * 60 * 1000,
  },
};
