const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const config = require('../config');
const clock = require('../utils/clock');
const userRepository = require('../repositories/userRepository');
const auditService = require('./auditService');
const { badRequest, conflict, unauthorized, locked, notFound, forbidden } = require('../utils/errors');

const ROLES = ['STUDENT', 'TECHNICIAN', 'ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < config.auth.minPasswordLength) {
    throw badRequest(`Password must be at least ${config.auth.minPasswordLength} characters long`, 'WEAK_PASSWORD');
  }
}

async function hashPassword(password) {
  validatePassword(password);
  return bcrypt.hash(password, config.bcryptRounds);
}

async function register({ name, email, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanName) throw badRequest('Name is required');
  if (!EMAIL_RE.test(cleanEmail)) throw badRequest('A valid email is required');
  const passwordHash = await hashPassword(password);
  if (userRepository.emailExists(cleanEmail)) throw conflict('Email is already registered', 'EMAIL_TAKEN');

  const user = userRepository.create({ name: cleanName, email: cleanEmail, passwordHash, role: 'STUDENT' });
  auditService.log(user.id, 'USER_REGISTERED', 'User', user.id, { email: user.email });
  return user;
}

async function authenticate(email, password) {
  const cleanEmail = normalizeEmail(email);
  const user = userRepository.findByEmailWithPassword(cleanEmail);
  if (!user) throw unauthorized('Invalid email or password');

  const now = clock.now();
  if (user.locked_until && new Date(user.locked_until) > now) {
    throw locked('Account is locked due to too many failed login attempts. Try again later.');
  }

  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) {
    // A lock that has already expired starts a fresh counting window.
    const previous = user.locked_until ? 0 : user.failed_login_attempts;
    const attempts = previous + 1;
    if (attempts >= config.auth.maxFailedLogins) {
      const until = new Date(now.getTime() + config.auth.lockMinutes * 60 * 1000).toISOString();
      userRepository.recordFailedLogin(user.id, attempts, until);
      auditService.log(user.id, 'ACCOUNT_LOCKED', 'User', user.id, { lockedUntil: until });
    } else {
      userRepository.recordFailedLogin(user.id, attempts, null);
    }
    throw unauthorized('Invalid email or password');
  }

  if (user.failed_login_attempts > 0 || user.locked_until) {
    userRepository.resetLoginState(user.id);
  }
  auditService.log(user.id, 'USER_LOGIN', 'User', user.id);
  return userRepository.findById(user.id);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw unauthorized('Invalid or expired token');
  }
}

function getById(id) {
  return userRepository.findById(id);
}

function listUsers() {
  return userRepository.listAll();
}

function changeRole(actor, userId, role) {
  if (!ROLES.includes(role)) throw badRequest('Invalid role');
  const target = userRepository.findById(userId);
  if (!target) throw notFound('User not found');
  if (target.id === actor.id) throw forbidden('You cannot change your own role');
  if (target.role === role) return target;
  userRepository.updateRole(target.id, role);
  auditService.log(actor.id, 'USER_ROLE_CHANGED', 'User', target.id, { from: target.role, to: role });
  return userRepository.findById(target.id);
}

function unlockUser(actor, userId) {
  const target = userRepository.findById(userId);
  if (!target) throw notFound('User not found');
  userRepository.resetLoginState(target.id);
  auditService.log(actor.id, 'USER_UNLOCKED', 'User', target.id);
  return userRepository.findById(target.id);
}

function parsePreferences(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

function updateProfile(actor, { name, preferences }) {
  const user = userRepository.findById(actor.id);
  if (!user) throw notFound('User not found');

  const cleanName = name === undefined ? user.name : String(name).trim();
  if (!cleanName) throw badRequest('Name is required');

  let incoming = {};
  if (preferences !== undefined && preferences !== '') {
    if (typeof preferences === 'string') {
      try {
        incoming = JSON.parse(preferences);
      } catch (err) {
        throw badRequest('Preferences must be valid JSON');
      }
    } else {
      incoming = preferences;
    }
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      throw badRequest('Preferences must be a JSON object');
    }
  }

  const merged = _.merge({}, parsePreferences(user.preferences), incoming);
  userRepository.updateProfile(user.id, { name: cleanName, preferences: JSON.stringify(merged) });
  auditService.log(actor.id, 'PROFILE_UPDATED', 'User', user.id, { name: cleanName, preferences: incoming });
  return userRepository.findById(user.id);
}

module.exports = {
  ROLES,
  register,
  authenticate,
  hashPassword,
  issueToken,
  verifyToken,
  getById,
  listUsers,
  changeRole,
  unlockUser,
  updateProfile,
  parsePreferences,
};
