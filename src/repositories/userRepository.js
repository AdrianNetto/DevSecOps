const { getDb } = require('../config/database');

const PUBLIC_COLUMNS = 'id, name, email, role, preferences, failed_login_attempts, locked_until, created_at';

function findById(id) {
  return getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
}

function findByEmailWithPassword(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function emailExists(email) {
  return Boolean(getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(email));
}

function create({ name, email, passwordHash, role = 'STUDENT', preferences = '{}' }) {
  const info = getDb()
    .prepare('INSERT INTO users (name, email, password_hash, role, preferences) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, passwordHash, role, preferences);
  return findById(info.lastInsertRowid);
}

function listAll() {
  return getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY name`).all();
}

function updateRole(id, role) {
  getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

function updateProfile(id, { name, preferences }) {
  getDb().prepare('UPDATE users SET name = ?, preferences = ? WHERE id = ?').run(name, preferences, id);
}

function recordFailedLogin(id, attempts, lockedUntil) {
  getDb()
    .prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
    .run(attempts, lockedUntil, id);
}

function resetLoginState(id) {
  getDb().prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(id);
}

module.exports = {
  findById,
  findByEmailWithPassword,
  emailExists,
  create,
  listAll,
  updateRole,
  updateProfile,
  recordFailedLogin,
  resetLoginState,
};
