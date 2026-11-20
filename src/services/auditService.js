const auditRepository = require('../repositories/auditRepository');

function log(userId, action, entity, entityId, details) {
  auditRepository.create({
    userId,
    action,
    entity,
    entityId,
    details: details === undefined ? null : typeof details === 'string' ? details : JSON.stringify(details),
  });
}

function search(filters) {
  return auditRepository.search(filters);
}

function distinctActions() {
  return auditRepository.distinctActions();
}

module.exports = { log, search, distinctActions };
