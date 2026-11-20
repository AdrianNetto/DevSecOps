const { getDb } = require('../config/database');

function create({ userId, action, entity, entityId, details }) {
  getDb()
    .prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)')
    .run(userId || null, action, entity, entityId || null, details || null);
}

function search({ userId, action, entity, from, to, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (userId) {
    where.push('a.user_id = ?');
    params.push(userId);
  }
  if (action) {
    where.push('a.action = ?');
    params.push(action);
  }
  if (entity) {
    where.push('a.entity = ?');
    params.push(entity);
  }
  if (from) {
    where.push('date(a.created_at) >= ?');
    params.push(from);
  }
  if (to) {
    where.push('date(a.created_at) <= ?');
    params.push(to);
  }
  params.push(limit);
  return getDb()
    .prepare(
      `SELECT a.*, u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.id DESC
       LIMIT ?`
    )
    .all(...params);
}

function distinctActions() {
  return getDb()
    .prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action')
    .all()
    .map((r) => r.action);
}

module.exports = { create, search, distinctActions };
