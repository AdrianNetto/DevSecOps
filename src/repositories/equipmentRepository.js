const { getDb } = require('../config/database');

function findById(id) {
  return getDb().prepare('SELECT * FROM equipment WHERE id = ?').get(id);
}

function findBySerial(serialNumber) {
  return getDb().prepare('SELECT * FROM equipment WHERE serial_number = ?').get(serialNumber);
}

function search({ q, category, status } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(name LIKE ? OR description LIKE ? OR serial_number LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const sql = `SELECT * FROM equipment ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name`;
  return getDb().prepare(sql).all(...params);
}

function listCategories() {
  return getDb()
    .prepare('SELECT DISTINCT category FROM equipment ORDER BY category')
    .all()
    .map((r) => r.category);
}

function create({ name, description, category, serialNumber, status = 'AVAILABLE', photoPath = null }) {
  const info = getDb()
    .prepare(
      'INSERT INTO equipment (name, description, category, serial_number, status, photo_path) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(name, description, category, serialNumber, status, photoPath);
  return findById(info.lastInsertRowid);
}

function update(id, { name, description, category, serialNumber, status }) {
  getDb()
    .prepare('UPDATE equipment SET name = ?, description = ?, category = ?, serial_number = ?, status = ? WHERE id = ?')
    .run(name, description, category, serialNumber, status, id);
  return findById(id);
}

function updateStatus(id, status) {
  getDb().prepare('UPDATE equipment SET status = ? WHERE id = ?').run(status, id);
}

function updatePhoto(id, photoPath) {
  getDb().prepare('UPDATE equipment SET photo_path = ? WHERE id = ?').run(photoPath, id);
}

function remove(id) {
  getDb().prepare('DELETE FROM equipment WHERE id = ?').run(id);
}

function countLoans(id) {
  return getDb().prepare('SELECT COUNT(*) AS n FROM loans WHERE equipment_id = ?').get(id).n;
}

module.exports = {
  findById,
  findBySerial,
  search,
  listCategories,
  create,
  update,
  updateStatus,
  updatePhoto,
  remove,
  countLoans,
};
