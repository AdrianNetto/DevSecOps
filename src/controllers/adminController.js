const { stringify } = require('csv-stringify');
const userService = require('../services/userService');
const auditService = require('../services/auditService');
const loanService = require('../services/loanService');
const { setFlash } = require('../utils/http');

function users(req, res) {
  res.render('admin/users', { title: 'Users', users: userService.listUsers(), roles: userService.ROLES });
}

function changeRole(req, res) {
  const user = userService.changeRole(req.user, Number(req.params.id), req.body.role);
  setFlash(req, 'success', `${user.email} is now ${user.role}.`);
  res.redirect('/admin/users');
}

function unlock(req, res) {
  const user = userService.unlockUser(req.user, Number(req.params.id));
  setFlash(req, 'success', `${user.email} unlocked.`);
  res.redirect('/admin/users');
}

function auditLog(req, res) {
  const filters = {
    userId: req.query.userId ? Number(req.query.userId) : undefined,
    action: req.query.action || undefined,
    entity: req.query.entity || undefined,
    from: req.query.from || undefined,
    to: req.query.to || undefined,
  };
  res.render('admin/audit', {
    title: 'Audit log',
    entries: auditService.search(filters),
    actions: auditService.distinctActions(),
    users: userService.listUsers(),
    entities: ['User', 'Equipment', 'Loan', 'Report'],
    filters: req.query,
  });
}

function reports(req, res) {
  res.render('admin/reports', { title: 'Reports', statuses: loanService.STATUSES });
}

function exportLoansCsv(req, res, next) {
  const filters = { status: req.query.status, from: req.query.from, to: req.query.to };
  const loans = loanService.listAll(filters);
  auditService.log(req.user.id, 'REPORT_EXPORTED', 'Report', null, { ...filters, rows: loans.length });

  const columns = [
    'id',
    'status',
    'user_name',
    'user_email',
    'equipment_name',
    'equipment_serial',
    'requested_start',
    'due_date',
    'returned_at',
    'late_fee_cents',
    'notes',
    'created_at',
  ];
  stringify(loans, { header: true, columns }, (err, output) => {
    if (err) return next(err);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="loans-report.csv"');
    return res.send(output);
  });
}

module.exports = { users, changeRole, unlock, auditLog, reports, exportLoansCsv };
