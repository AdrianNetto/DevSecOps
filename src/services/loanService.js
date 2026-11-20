const config = require('../config');
const { getDb } = require('../config/database');
const clock = require('../utils/clock');
const dates = require('../utils/dates');
const loanRepository = require('../repositories/loanRepository');
const equipmentRepository = require('../repositories/equipmentRepository');
const auditService = require('./auditService');
const holidayService = require('./holidayService');
const { badRequest, conflict, forbidden, notFound } = require('../utils/errors');

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'RETURNED', 'OVERDUE', 'CANCELLED'];
const OPEN_STATUSES = ['PENDING', 'APPROVED', 'ACTIVE', 'OVERDUE'];
const BLOCKING_STATUSES = ['APPROVED', 'ACTIVE'];
const CANCELLABLE_STATUSES = ['PENDING', 'APPROVED'];
const RETURNABLE_STATUSES = ['ACTIVE', 'OVERDUE'];
const STAFF_ROLES = ['TECHNICIAN', 'ADMIN'];

function isStaff(user) {
  return Boolean(user) && STAFF_ROLES.includes(user.role);
}

function assertStaff(actor) {
  if (!isStaff(actor)) throw forbidden('Only technicians or admins can perform this action');
}

function transaction(fn) {
  return getDb().transaction(fn)();
}

// Rule 6: 5.00 BRL per full day late, capped at 100.00 BRL (stored in cents).
function calculateLateFee(dueDate, referenceDate) {
  const daysLate = dates.diffDays(dueDate, referenceDate);
  if (daysLate <= 0) return 0;
  return Math.min(daysLate * config.loans.lateFeePerDayCents, config.loans.lateFeeCapCents);
}

function getLoanOrThrow(id) {
  const loan = loanRepository.findById(id);
  if (!loan) throw notFound('Loan not found');
  return loan;
}

async function requestLoan(user, input) {
  const equipmentId = Number(input.equipmentId || input.equipment_id);
  const requestedStart = input.requestedStart || input.requested_start;
  const requestedDue = input.dueDate || input.due_date;
  const notes = input.notes ? String(input.notes).trim().slice(0, 1000) : null;

  if (!Number.isInteger(equipmentId) || equipmentId <= 0) throw badRequest('Equipment is required');
  if (!dates.isValidDateString(requestedStart)) throw badRequest('Start date must be a valid date (YYYY-MM-DD)');
  if (!dates.isValidDateString(requestedDue)) throw badRequest('Due date must be a valid date (YYYY-MM-DD)');

  // Rule 3: duration and start-date checks.
  const today = dates.today();
  if (requestedStart < today) throw badRequest('Start date cannot be in the past', 'START_IN_PAST');
  const duration = dates.diffDays(requestedStart, requestedDue);
  if (duration < config.loans.minDays || duration > config.loans.maxDays) {
    throw badRequest(
      `Loan duration must be between ${config.loans.minDays} and ${config.loans.maxDays} days`,
      'INVALID_DURATION'
    );
  }

  const equipment = equipmentRepository.findById(equipmentId);
  if (!equipment) throw notFound('Equipment not found');
  // Rule 4: maintenance items cannot be loaned.
  if (equipment.status === 'MAINTENANCE') {
    throw conflict('Equipment is under maintenance and cannot be loaned', 'EQUIPMENT_IN_MAINTENANCE');
  }

  // Rule 3: weekend/holiday due dates roll forward to the next business day.
  const dueDate = await holidayService.nextBusinessDay(requestedDue);

  return transaction(() => {
    if (user.role === 'STUDENT') {
      // Rule 2: any overdue loan blocks new requests.
      if (loanRepository.countByUserAndStatuses(user.id, ['OVERDUE']) > 0) {
        throw conflict('You have an overdue loan and cannot request new loans', 'HAS_OVERDUE');
      }
      // Rule 1: at most 3 open loans.
      if (loanRepository.countByUserAndStatuses(user.id, OPEN_STATUSES) >= config.loans.maxOpenLoansPerStudent) {
        throw conflict(
          `Students can have at most ${config.loans.maxOpenLoansPerStudent} open loans`,
          'LOAN_LIMIT_REACHED'
        );
      }
    }

    // Rule 4: no overlap with approved/active loans.
    if (loanRepository.findOverlapping(equipmentId, requestedStart, dueDate, BLOCKING_STATUSES).length > 0) {
      throw conflict('Equipment is already booked for the requested period', 'OVERLAPPING_LOAN');
    }

    const loan = loanRepository.create({ userId: user.id, equipmentId, requestedStart, dueDate, notes });
    auditService.log(user.id, 'LOAN_REQUESTED', 'Loan', loan.id, {
      equipmentId,
      requestedStart,
      requestedDue,
      dueDate,
    });
    return loan;
  });
}

// Moves an APPROVED loan to ACTIVE if its period has started and the equipment is free.
function activateIfDue(loan, actorId, today) {
  if (loan.status !== 'APPROVED' || loan.requested_start > today) return false;
  const equipment = equipmentRepository.findById(loan.equipment_id);
  if (!equipment || equipment.status !== 'AVAILABLE') return false;
  loanRepository.updateStatus(loan.id, 'ACTIVE');
  equipmentRepository.updateStatus(loan.equipment_id, 'LOANED');
  auditService.log(actorId, 'LOAN_ACTIVATED', 'Loan', loan.id, { equipmentId: loan.equipment_id });
  return true;
}

function approveLoan(actor, loanId) {
  assertStaff(actor);
  return transaction(() => {
    const loan = getLoanOrThrow(loanId);
    if (loan.status !== 'PENDING') throw conflict(`Only PENDING loans can be approved (current: ${loan.status})`);

    const equipment = equipmentRepository.findById(loan.equipment_id);
    if (equipment.status === 'MAINTENANCE') {
      throw conflict('Equipment is under maintenance and cannot be loaned', 'EQUIPMENT_IN_MAINTENANCE');
    }
    const overlaps = loanRepository.findOverlapping(
      loan.equipment_id,
      loan.requested_start,
      loan.due_date,
      BLOCKING_STATUSES,
      loan.id
    );
    if (overlaps.length > 0) throw conflict('Equipment is already booked for this period', 'OVERLAPPING_LOAN');

    const approved = loanRepository.updateStatus(loan.id, 'APPROVED');
    auditService.log(actor.id, 'LOAN_APPROVED', 'Loan', loan.id);
    activateIfDue(approved, actor.id, dates.today());
    return loanRepository.findById(loan.id);
  });
}

function rejectLoan(actor, loanId, reason) {
  assertStaff(actor);
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) throw badRequest('A rejection reason is required', 'REASON_REQUIRED');
  return transaction(() => {
    const loan = getLoanOrThrow(loanId);
    if (loan.status !== 'PENDING') throw conflict(`Only PENDING loans can be rejected (current: ${loan.status})`);
    const updated = loanRepository.updateStatus(loan.id, 'REJECTED', { notes: cleanReason.slice(0, 1000) });
    auditService.log(actor.id, 'LOAN_REJECTED', 'Loan', loan.id, { reason: cleanReason });
    return updated;
  });
}

function registerReturn(actor, loanId) {
  assertStaff(actor);
  return transaction(() => {
    const loan = getLoanOrThrow(loanId);
    if (!RETURNABLE_STATUSES.includes(loan.status)) {
      throw conflict(`Only ACTIVE or OVERDUE loans can be returned (current: ${loan.status})`);
    }
    const now = clock.now();
    const lateFeeCents = calculateLateFee(loan.due_date, dates.toDateString(now));
    const updated = loanRepository.updateStatus(loan.id, 'RETURNED', {
      returnedAt: now.toISOString(),
      lateFeeCents,
    });
    equipmentRepository.updateStatus(loan.equipment_id, 'AVAILABLE');
    auditService.log(actor.id, 'LOAN_RETURNED', 'Loan', loan.id, { lateFeeCents });
    return updated;
  });
}

function cancelLoan(actor, loanId) {
  return transaction(() => {
    const loan = getLoanOrThrow(loanId);
    if (loan.user_id !== actor.id) throw forbidden('You can only cancel your own loans');
    if (!CANCELLABLE_STATUSES.includes(loan.status)) {
      throw conflict(`Only PENDING or APPROVED loans can be cancelled (current: ${loan.status})`);
    }
    const updated = loanRepository.updateStatus(loan.id, 'CANCELLED');
    auditService.log(actor.id, 'LOAN_CANCELLED', 'Loan', loan.id);
    return updated;
  });
}

// Used by PATCH /api/loans/:id/status.
function changeStatus(actor, loanId, { status, reason } = {}) {
  switch (status) {
    case 'APPROVED':
      return approveLoan(actor, loanId);
    case 'REJECTED':
      return rejectLoan(actor, loanId, reason);
    case 'RETURNED':
      return registerReturn(actor, loanId);
    case 'CANCELLED':
      return cancelLoan(actor, loanId);
    default:
      throw badRequest('Status must be one of APPROVED, REJECTED, RETURNED, CANCELLED');
  }
}

// Rules 5 and 6: activate loans whose period started, flag overdue ones and refresh late fees.
function runScheduledChecks() {
  const today = dates.today();
  return transaction(() => {
    let activated = 0;
    for (const loan of loanRepository.findApprovedStartingBy(today)) {
      if (activateIfDue(loan, null, today)) activated += 1;
    }

    let overdue = 0;
    for (const loan of loanRepository.findActivePastDue(today)) {
      const lateFeeCents = calculateLateFee(loan.due_date, today);
      loanRepository.updateStatus(loan.id, 'OVERDUE', { lateFeeCents });
      auditService.log(null, 'LOAN_OVERDUE', 'Loan', loan.id, { dueDate: loan.due_date, lateFeeCents });
      overdue += 1;
    }

    for (const loan of loanRepository.findByStatus('OVERDUE')) {
      const lateFeeCents = calculateLateFee(loan.due_date, today);
      if (lateFeeCents !== loan.late_fee_cents) loanRepository.updateLateFee(loan.id, lateFeeCents);
    }

    return { activated, overdue };
  });
}

function getLoanForUser(user, loanId) {
  const loan = getLoanOrThrow(loanId);
  if (!isStaff(user) && loan.user_id !== user.id) throw notFound('Loan not found');
  return loan;
}

function listForUser(user) {
  return loanRepository.listByUser(user.id);
}

function listVisibleTo(user, filters = {}) {
  if (isStaff(user)) return listAll(filters);
  return listForUser(user);
}

function listAll(filters = {}) {
  return loanRepository.listAll({
    status: STATUSES.includes(filters.status) ? filters.status : undefined,
    from: dates.isValidDateString(filters.from) ? filters.from : undefined,
    to: dates.isValidDateString(filters.to) ? filters.to : undefined,
  });
}

function dashboard() {
  return {
    pending: loanRepository.listByStatuses(['PENDING']),
    approved: loanRepository.listByStatuses(['APPROVED']),
    active: loanRepository.listByStatuses(['ACTIVE']),
    overdue: loanRepository.listByStatuses(['OVERDUE']),
  };
}

module.exports = {
  STATUSES,
  OPEN_STATUSES,
  isStaff,
  calculateLateFee,
  requestLoan,
  approveLoan,
  rejectLoan,
  registerReturn,
  cancelLoan,
  changeStatus,
  runScheduledChecks,
  getLoanForUser,
  listForUser,
  listVisibleTo,
  listAll,
  dashboard,
};
