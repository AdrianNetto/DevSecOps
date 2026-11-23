const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const env = process.env.NODE_ENV || 'development';

// Secrets must come from the environment in production; dev/test fall back to a fixed value.
function required(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (env === 'production') {
    throw new Error(`Missing required environment variable ${name} (NODE_ENV=production)`);
  }
  return devFallback;
}

module.exports = {
  env,
  port: parseInt(process.env.PORT, 10) || 3000,
  dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'lablend.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  sessionSecret: required('SESSION_SECRET', 'lablend-dev-session-secret'),
  // Send the session cookie only over HTTPS: on by default in production, COOKIE_SECURE=true|false overrides it.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env === 'production',
  jwtSecret: required('JWT_SECRET', 'lablend-dev-jwt-secret'),
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
