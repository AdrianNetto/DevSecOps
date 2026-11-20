jest.mock('axios');

const loanService = require('../src/services/loanService');
const equipmentRepository = require('../src/repositories/equipmentRepository');
const loanRepository = require('../src/repositories/loanRepository');
const auditRepository = require('../src/repositories/auditRepository');
const { setToday, resetState, makeUser, makeEquipment, makeLoan } = require('./helpers');

// Monday, 10 March 2025
const TODAY = '2025-03-10';

beforeEach(() => {
  resetState();
  setToday(TODAY);
});

describe('Rule 1: max 3 open loans per student', () => {
  test('rejects a 4th open loan (PENDING/APPROVED/ACTIVE count toward the limit)', async () => {
    const student = await makeUser('STUDENT');
    makeLoan(student, makeEquipment(), { start: '2025-03-10', due: '2025-03-12', status: 'PENDING' });
    makeLoan(student, makeEquipment(), { start: '2025-03-10', due: '2025-03-12', status: 'APPROVED' });
    makeLoan(student, makeEquipment(), { start: '2025-03-05', due: '2025-03-12', status: 'ACTIVE' });

    await expect(
      loanService.requestLoan(student, { equipmentId: makeEquipment().id, requestedStart: TODAY, dueDate: '2025-03-12' })
    ).rejects.toMatchObject({ status: 409, code: 'LOAN_LIMIT_REACHED' });
  });

  test('closed loans (RETURNED/REJECTED/CANCELLED) do not count toward the limit', async () => {
    const student = await makeUser('STUDENT');
    for (const status of ['RETURNED', 'REJECTED', 'CANCELLED']) {
      makeLoan(student, makeEquipment(), { start: '2025-03-01', due: '2025-03-05', status });
    }
    makeLoan(student, makeEquipment(), { start: '2025-03-10', due: '2025-03-12', status: 'PENDING' });
    makeLoan(student, makeEquipment(), { start: '2025-03-10', due: '2025-03-12', status: 'PENDING' });

    const loan = await loanService.requestLoan(student, {
      equipmentId: makeEquipment().id,
      requestedStart: TODAY,
      dueDate: '2025-03-12',
    });
    expect(loan.status).toBe('PENDING');
  });
});

describe('Rule 2: overdue loans block new requests', () => {
  test('student with an OVERDUE loan cannot request a new one', async () => {
    const student = await makeUser('STUDENT');
    makeLoan(student, makeEquipment(), { start: '2025-02-20', due: '2025-03-01', status: 'OVERDUE' });

    await expect(
      loanService.requestLoan(student, { equipmentId: makeEquipment().id, requestedStart: TODAY, dueDate: '2025-03-12' })
    ).rejects.toMatchObject({ status: 409, code: 'HAS_OVERDUE' });
  });
});

describe('Rule 3: duration, start date and business-day due dates', () => {
  test('rejects a start date in the past', async () => {
    const student = await makeUser('STUDENT');
    await expect(
      loanService.requestLoan(student, { equipmentId: makeEquipment().id, requestedStart: '2025-03-09', dueDate: '2025-03-12' })
    ).rejects.toMatchObject({ code: 'START_IN_PAST' });
  });

  test.each([
    ['0 days', '2025-03-10'],
    ['15 days', '2025-03-25'],
    ['due before start', '2025-03-08'],
  ])('rejects invalid duration (%s)', async (_label, due) => {
    const student = await makeUser('STUDENT');
    await expect(
      loanService.requestLoan(student, { equipmentId: makeEquipment().id, requestedStart: TODAY, dueDate: due })
    ).rejects.toMatchObject({ code: 'INVALID_DURATION' });
  });

  test('accepts the 1 and 14 day boundaries', async () => {
    const student = await makeUser('STUDENT');
    const oneDay = await loanService.requestLoan(student, {
      equipmentId: makeEquipment().id,
      requestedStart: TODAY,
      dueDate: '2025-03-11',
    });
    const fourteen = await loanService.requestLoan(student, {
      equipmentId: makeEquipment().id,
      requestedStart: TODAY,
      dueDate: '2025-03-24',
    });
    expect(oneDay.due_date).toBe('2025-03-11');
    expect(fourteen.due_date).toBe('2025-03-24');
  });

  test('a due date on Saturday is moved to the following Monday', async () => {
    const student = await makeUser('STUDENT');
    const loan = await loanService.requestLoan(student, {
      equipmentId: makeEquipment().id,
      requestedStart: TODAY,
      dueDate: '2025-03-15',
    });
    expect(loan.due_date).toBe('2025-03-17');
  });

  test('a due date on a public holiday (fallback list) skips holidays and weekends', async () => {
    // Good Friday 2025-04-18 -> weekend -> Tiradentes (Mon 04-21) -> Tue 04-22
    setToday('2025-04-07');
    const student = await makeUser('STUDENT');
    const loan = await loanService.requestLoan(student, {
      equipmentId: makeEquipment().id,
      requestedStart: '2025-04-08',
      dueDate: '2025-04-18',
    });
    expect(loan.due_date).toBe('2025-04-22');
  });
});

describe('Rule 4: maintenance and overlapping loans', () => {
  test('equipment in MAINTENANCE cannot be requested', async () => {
    const student = await makeUser('STUDENT');
    const item = makeEquipment({ status: 'MAINTENANCE' });
    await expect(
      loanService.requestLoan(student, { equipmentId: item.id, requestedStart: TODAY, dueDate: '2025-03-12' })
    ).rejects.toMatchObject({ code: 'EQUIPMENT_IN_MAINTENANCE' });
  });

  test('cannot request equipment overlapping an APPROVED or ACTIVE loan, but adjacent periods are fine', async () => {
    const [a, b] = [await makeUser('STUDENT'), await makeUser('STUDENT')];
    const item = makeEquipment();
    makeLoan(a, item, { start: '2025-03-12', due: '2025-03-14', status: 'APPROVED' });

    await expect(
      loanService.requestLoan(b, { equipmentId: item.id, requestedStart: '2025-03-14', dueDate: '2025-03-18' })
    ).rejects.toMatchObject({ code: 'OVERLAPPING_LOAN' });

    const ok = await loanService.requestLoan(b, { equipmentId: item.id, requestedStart: '2025-03-17', dueDate: '2025-03-19' });
    expect(ok.status).toBe('PENDING');
  });

  test('approving a PENDING loan that overlaps an approved one is refused', async () => {
    const tech = await makeUser('TECHNICIAN');
    const [a, b] = [await makeUser('STUDENT'), await makeUser('STUDENT')];
    const item = makeEquipment();
    const first = makeLoan(a, item, { start: '2025-03-12', due: '2025-03-14' });
    const second = makeLoan(b, item, { start: '2025-03-13', due: '2025-03-17' });

    loanService.approveLoan(tech, first.id);
    expect(() => loanService.approveLoan(tech, second.id)).toThrow(expect.objectContaining({ code: 'OVERLAPPING_LOAN' }));
  });
});

describe('Rule 5: approval, activation and return', () => {
  test('students cannot approve, reject or register returns', async () => {
    const student = await makeUser('STUDENT');
    const loan = makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });
    expect(() => loanService.approveLoan(student, loan.id)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => loanService.rejectLoan(student, loan.id, 'nope')).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => loanService.registerReturn(student, loan.id)).toThrow(expect.objectContaining({ status: 403 }));
  });

  test('approved loan becomes ACTIVE on its start date, equipment LOANED; return makes it AVAILABLE', async () => {
    const tech = await makeUser('TECHNICIAN');
    const student = await makeUser('STUDENT');
    const item = makeEquipment();
    const loan = makeLoan(student, item, { start: '2025-03-12', due: '2025-03-14' });

    expect(loanService.approveLoan(tech, loan.id).status).toBe('APPROVED');
    expect(equipmentRepository.findById(item.id).status).toBe('AVAILABLE');

    setToday('2025-03-11');
    loanService.runScheduledChecks();
    expect(loanRepository.findById(loan.id).status).toBe('APPROVED');

    setToday('2025-03-12');
    expect(loanService.runScheduledChecks().activated).toBe(1);
    expect(loanRepository.findById(loan.id).status).toBe('ACTIVE');
    expect(equipmentRepository.findById(item.id).status).toBe('LOANED');

    const returned = loanService.registerReturn(tech, loan.id);
    expect(returned.status).toBe('RETURNED');
    expect(returned.returned_at).toBeTruthy();
    expect(returned.late_fee_cents).toBe(0);
    expect(equipmentRepository.findById(item.id).status).toBe('AVAILABLE');
  });

  test('approving a loan whose start date is today activates it immediately', async () => {
    const tech = await makeUser('TECHNICIAN');
    const student = await makeUser('STUDENT');
    const item = makeEquipment();
    const loan = makeLoan(student, item, { start: TODAY, due: '2025-03-12' });
    expect(loanService.approveLoan(tech, loan.id).status).toBe('ACTIVE');
    expect(equipmentRepository.findById(item.id).status).toBe('LOANED');
  });
});

describe('Rule 6: overdue detection and late fees', () => {
  test('late fee is 5.00 BRL per full day, capped at 100.00 BRL', () => {
    expect(loanService.calculateLateFee('2025-03-10', '2025-03-10')).toBe(0);
    expect(loanService.calculateLateFee('2025-03-10', '2025-03-11')).toBe(500);
    expect(loanService.calculateLateFee('2025-03-10', '2025-03-17')).toBe(3500);
    expect(loanService.calculateLateFee('2025-03-10', '2025-03-30')).toBe(10000);
    expect(loanService.calculateLateFee('2025-03-10', '2025-06-30')).toBe(10000);
  });

  test('ACTIVE loan past due date becomes OVERDUE with fee; return charges the fee', async () => {
    const tech = await makeUser('TECHNICIAN');
    const student = await makeUser('STUDENT');
    const item = makeEquipment({ status: 'LOANED' });
    const loan = makeLoan(student, item, { start: '2025-03-03', due: '2025-03-07', status: 'ACTIVE' });

    setToday('2025-03-07');
    expect(loanService.runScheduledChecks().overdue).toBe(0);

    setToday('2025-03-10');
    loanService.runScheduledChecks();
    let current = loanRepository.findById(loan.id);
    expect(current.status).toBe('OVERDUE');
    expect(current.late_fee_cents).toBe(1500);

    setToday('2025-03-12');
    loanService.runScheduledChecks();
    expect(loanRepository.findById(loan.id).late_fee_cents).toBe(2500);

    current = loanService.registerReturn(tech, loan.id);
    expect(current.status).toBe('RETURNED');
    expect(current.late_fee_cents).toBe(2500);
  });
});

describe('Rule 7: cancellation', () => {
  test('student can cancel own PENDING or APPROVED loan', async () => {
    const student = await makeUser('STUDENT');
    const pending = makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });
    const approved = makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14', status: 'APPROVED' });
    expect(loanService.cancelLoan(student, pending.id).status).toBe('CANCELLED');
    expect(loanService.cancelLoan(student, approved.id).status).toBe('CANCELLED');
  });

  test("cannot cancel someone else's loan or an ACTIVE loan", async () => {
    const [owner, other] = [await makeUser('STUDENT'), await makeUser('STUDENT')];
    const pending = makeLoan(owner, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });
    const active = makeLoan(owner, makeEquipment(), { start: '2025-03-10', due: '2025-03-14', status: 'ACTIVE' });
    expect(() => loanService.cancelLoan(other, pending.id)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => loanService.cancelLoan(owner, active.id)).toThrow(expect.objectContaining({ status: 409 }));
    expect(loanRepository.findById(pending.id).status).toBe('PENDING');
  });
});

describe('Rule 8: rejection requires a reason', () => {
  test('empty reason is refused; reason is stored in notes', async () => {
    const tech = await makeUser('TECHNICIAN');
    const student = await makeUser('STUDENT');
    const loan = makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });

    expect(() => loanService.rejectLoan(tech, loan.id, '   ')).toThrow(expect.objectContaining({ code: 'REASON_REQUIRED' }));
    expect(loanRepository.findById(loan.id).status).toBe('PENDING');

    const rejected = loanService.rejectLoan(tech, loan.id, 'Reserved for a class');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.notes).toBe('Reserved for a class');
  });
});

describe('Rule 9: audit log', () => {
  test('each state change writes an audit entry', async () => {
    const tech = await makeUser('TECHNICIAN');
    const student = await makeUser('STUDENT');
    const item = makeEquipment();

    const loan = await loanService.requestLoan(student, { equipmentId: item.id, requestedStart: TODAY, dueDate: '2025-03-12' });
    loanService.approveLoan(tech, loan.id);
    setToday('2025-03-14');
    loanService.runScheduledChecks();
    loanService.registerReturn(tech, loan.id);

    const actions = auditRepository
      .search({ entity: 'Loan' })
      .filter((e) => e.entity_id === loan.id)
      .map((e) => e.action)
      .reverse();
    expect(actions).toEqual(['LOAN_REQUESTED', 'LOAN_APPROVED', 'LOAN_ACTIVATED', 'LOAN_OVERDUE', 'LOAN_RETURNED']);
  });
});
