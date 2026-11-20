const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const config = require('../config');
const equipmentRepository = require('../repositories/equipmentRepository');
const auditService = require('./auditService');
const { badRequest, conflict, notFound } = require('../utils/errors');

const STATUSES = ['AVAILABLE', 'LOANED', 'MAINTENANCE'];
// Staff can only toggle these manually; LOANED is driven by the loan workflow.
const EDITABLE_STATUSES = ['AVAILABLE', 'MAINTENANCE'];

function search(filters = {}) {
  return equipmentRepository.search({
    q: filters.q ? String(filters.q).trim() : undefined,
    category: filters.category || undefined,
    status: STATUSES.includes(filters.status) ? filters.status : undefined,
  });
}

function listCategories() {
  return equipmentRepository.listCategories();
}

function getById(id) {
  const item = equipmentRepository.findById(id);
  if (!item) throw notFound('Equipment not found');
  return item;
}

function renderDescription(markdown) {
  return marked.parse(markdown || '');
}

function getForDisplay(id) {
  const item = getById(id);
  return { ...item, descriptionHtml: renderDescription(item.description) };
}

function validateInput(input) {
  const data = {
    name: String(input.name || '').trim(),
    description: String(input.description || ''),
    category: String(input.category || '').trim(),
    serialNumber: String(input.serial_number || input.serialNumber || '').trim(),
    status: input.status || 'AVAILABLE',
  };
  if (!data.name) throw badRequest('Name is required');
  if (!data.category) throw badRequest('Category is required');
  if (!data.serialNumber) throw badRequest('Serial number is required');
  if (!EDITABLE_STATUSES.includes(data.status)) throw badRequest('Status must be AVAILABLE or MAINTENANCE');
  return data;
}

function photoUrl(file) {
  return file ? `/uploads/${path.basename(file.filename)}` : null;
}

function removePhotoFile(photoPath) {
  if (!photoPath) return;
  const filePath = path.join(config.uploadDir, path.basename(photoPath));
  fs.unlink(filePath, () => {});
}

function create(actor, input, file) {
  const data = validateInput(input);
  if (equipmentRepository.findBySerial(data.serialNumber)) {
    throw conflict('Serial number already exists', 'DUPLICATE_SERIAL');
  }
  const item = equipmentRepository.create({ ...data, photoPath: photoUrl(file) });
  auditService.log(actor.id, 'EQUIPMENT_CREATED', 'Equipment', item.id, {
    name: item.name,
    serial: item.serial_number,
  });
  return item;
}

function update(actor, id, input, file) {
  const existing = getById(id);
  const data = validateInput(input);
  const sameSerial = equipmentRepository.findBySerial(data.serialNumber);
  if (sameSerial && sameSerial.id !== existing.id) {
    throw conflict('Serial number already exists', 'DUPLICATE_SERIAL');
  }
  // Loaned equipment keeps its status until the loan is returned.
  if (existing.status === 'LOANED') data.status = 'LOANED';

  const item = equipmentRepository.update(existing.id, data);
  if (file) {
    removePhotoFile(existing.photo_path);
    equipmentRepository.updatePhoto(existing.id, photoUrl(file));
  }
  auditService.log(actor.id, 'EQUIPMENT_UPDATED', 'Equipment', item.id, {
    name: data.name,
    status: data.status,
    photoChanged: Boolean(file),
  });
  return equipmentRepository.findById(item.id);
}

function remove(actor, id) {
  const existing = getById(id);
  if (equipmentRepository.countLoans(existing.id) > 0) {
    throw conflict('Equipment with loan history cannot be deleted; set it to MAINTENANCE instead');
  }
  equipmentRepository.remove(existing.id);
  removePhotoFile(existing.photo_path);
  auditService.log(actor.id, 'EQUIPMENT_DELETED', 'Equipment', existing.id, {
    name: existing.name,
    serial: existing.serial_number,
  });
}

module.exports = {
  STATUSES,
  EDITABLE_STATUSES,
  search,
  listCategories,
  getById,
  getForDisplay,
  renderDescription,
  create,
  update,
  remove,
};
