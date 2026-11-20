const loanService = require('../services/loanService');
const equipmentService = require('../services/equipmentService');
const dates = require('../utils/dates');
const { setFlash } = require('../utils/http');

function newForm(req, res) {
  const equipment = equipmentService.search({ status: 'AVAILABLE' }).concat(equipmentService.search({ status: 'LOANED' }));
  const today = dates.today();
  res.render('loans/new', {
    title: 'Request a loan',
    equipment,
    form: {
      equipment_id: req.query.equipmentId || '',
      requested_start: today,
      due_date: dates.addDays(today, 7),
      notes: '',
    },
  });
}

async function create(req, res) {
  const loan = await loanService.requestLoan(req.user, req.body);
  const moved = loan.due_date !== req.body.due_date;
  setFlash(
    req,
    'success',
    `Loan request #${loan.id} submitted.${moved ? ` Due date moved to the next business day: ${loan.due_date}.` : ''}`
  );
  res.redirect('/loans/mine');
}

function myLoans(req, res) {
  loanService.runScheduledChecks();
  res.render('loans/mine', { title: 'My loans', loans: loanService.listForUser(req.user) });
}

function cancel(req, res) {
  const loan = loanService.cancelLoan(req.user, Number(req.params.id));
  setFlash(req, 'success', `Loan #${loan.id} cancelled.`);
  res.redirect('/loans/mine');
}

function dashboard(req, res) {
  loanService.runScheduledChecks();
  res.render('staff/dashboard', { title: 'Technician dashboard', ...loanService.dashboard() });
}

function approve(req, res) {
  const loan = loanService.approveLoan(req.user, Number(req.params.id));
  setFlash(req, 'success', `Loan #${loan.id} is now ${loan.status}.`);
  res.redirect('/staff/dashboard');
}

function reject(req, res) {
  const loan = loanService.rejectLoan(req.user, Number(req.params.id), req.body.reason);
  setFlash(req, 'success', `Loan #${loan.id} rejected.`);
  res.redirect('/staff/dashboard');
}

function registerReturn(req, res) {
  const loan = loanService.registerReturn(req.user, Number(req.params.id));
  const fee = loan.late_fee_cents ? ` Late fee: R$ ${(loan.late_fee_cents / 100).toFixed(2)}.` : '';
  setFlash(req, 'success', `Loan #${loan.id} returned.${fee}`);
  res.redirect('/staff/dashboard');
}

function runChecks(req, res) {
  const result = loanService.runScheduledChecks();
  setFlash(req, 'success', `Checks done: ${result.activated} activated, ${result.overdue} marked overdue.`);
  res.redirect('/staff/dashboard');
}

module.exports = { newForm, create, myLoans, cancel, dashboard, approve, reject, registerReturn, runChecks };
