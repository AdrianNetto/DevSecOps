const { getDb } = require('../config/database');

const BASE_SELECT = `
  SELECT l.*, u.name AS user_name, u.email AS user_email,
         e.name AS equipment_name, e.serial_number AS equipment_serial
  FROM loans l
  JOIN users u ON u.id = l.user_id
  JOIN equipment e ON e.id = l.equipment_id
`;

function findById(id) {
  return getDb().prepare(`${BASE_SELECT} WHERE l.id = ?`).get(id);
}

function create({ userId, equipmentId, requestedStart, dueDate, notes = null }) {
  const info = getDb()
    .prepare(
      `INSERT INTO loans (user_id, equipment_id, status, requested_start, due_date, notes)
       VALUES (?, ?, 'PENDING', ?, ?, ?)`
    )
    .run(userId, equipmentId, requestedStart, dueDate, notes);
  return findById(info.lastInsertRowid);
}

function countByUserAndStatuses(userId, statuses) {
  const placeholders = statuses.map(() => '?').join(', ');
  return getDb()
    .prepare(`SELECT COUNT(*) AS n FROM loans WHERE user_id = ? AND status IN (${placeholders})`)
    .get(userId, ...statuses).n;
}

// Loans of the equipment in the given statuses whose [start, due] range intersects [start, due].
function findOverlapping(equipmentId, start, due, statuses, excludeLoanId = null) {
  const placeholders = statuses.map(() => '?').join(', ');
  return getDb()
    .prepare(
      `SELECT * FROM loans
       WHERE equipment_id = ?
         AND status IN (${placeholders})
         AND requested_start <= ?
         AND due_date >= ?
         AND id != ?`
    )
    .all(equipmentId, ...statuses, due, start, excludeLoanId || 0);
}

function listByUser(userId) {
  return getDb().prepare(`${BASE_SELECT} WHERE l.user_id = ? ORDER BY l.requested_start DESC, l.id DESC`).all(userId);
}

function listByStatuses(statuses) {
  const placeholders = statuses.map(() => '?').join(', ');
  return getDb()
    .prepare(`${BASE_SELECT} WHERE l.status IN (${placeholders}) ORDER BY l.requested_start, l.id`)
    .all(...statuses);
}

function listAll({ status, from, to } = {}) {
  const where = [];
  const params = [];
  if (status) {
    where.push('l.status = ?');
    params.push(status);
  }
  if (from) {
    where.push('l.requested_start >= ?');
    params.push(from);
  }
  if (to) {
    where.push('l.requested_start <= ?');
    params.push(to);
  }
  const sql = `${BASE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.requested_start DESC, l.id DESC`;
  return getDb().prepare(sql).all(...params);
}

function findApprovedStartingBy(dateStr) {
  return getDb()
    .prepare(`SELECT * FROM loans WHERE status = 'APPROVED' AND requested_start <= ?`)
    .all(dateStr);
}

function findActivePastDue(dateStr) {
  return getDb().prepare(`SELECT * FROM loans WHERE status = 'ACTIVE' AND due_date < ?`).all(dateStr);
}

function findByStatus(status) {
  return getDb().prepare('SELECT * FROM loans WHERE status = ?').all(status);
}

function updateStatus(id, status, extra = {}) {
  const sets = ['status = ?'];
  const params = [status];
  if (Object.prototype.hasOwnProperty.call(extra, 'notes')) {
    sets.push('notes = ?');
    params.push(extra.notes);
  }
  if (Object.prototype.hasOwnProperty.call(extra, 'returnedAt')) {
    sets.push('returned_at = ?');
    params.push(extra.returnedAt);
  }
  if (Object.prototype.hasOwnProperty.call(extra, 'lateFeeCents')) {
    sets.push('late_fee_cents = ?');
    params.push(extra.lateFeeCents);
  }
  params.push(id);
  getDb().prepare(`UPDATE loans SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return findById(id);
}

function updateLateFee(id, lateFeeCents) {
  getDb().prepare('UPDATE loans SET late_fee_cents = ? WHERE id = ?').run(lateFeeCents, id);
}

module.exports = {
  findById,
  create,
  countByUserAndStatuses,
  findOverlapping,
  listByUser,
  listByStatuses,
  listAll,
  findApprovedStartingBy,
  findActivePastDue,
  findByStatus,
  updateStatus,
  updateLateFee,
};
