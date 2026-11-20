jest.mock('axios');

const request = require('supertest');
const { createApp } = require('../src/app');
const { resetState, setToday, makeUser, makeEquipment, makeLoan, DEFAULT_PASSWORD } = require('./helpers');

const app = createApp();

async function tokenFor(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });
  return res.body.token;
}

beforeEach(() => {
  resetState();
  setToday('2025-03-10');
});

describe('REST API', () => {
  test('requires a valid bearer token', async () => {
    expect((await request(app).get('/api/equipment')).status).toBe(401);
    expect((await request(app).get('/api/equipment').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  });

  test('GET /api/equipment/:id renders the Markdown description', async () => {
    const student = await makeUser('STUDENT');
    const item = makeEquipment({ description: '# Title\n\nSome **bold** text' });
    const res = await request(app).get(`/api/equipment/${item.id}`).set('Authorization', `Bearer ${await tokenFor(student)}`);
    expect(res.status).toBe(200);
    expect(res.body.descriptionHtml).toContain('<strong>bold</strong>');
  });

  test('POST /api/loans creates a PENDING loan and enforces business rules', async () => {
    const student = await makeUser('STUDENT');
    const token = await tokenFor(student);
    const item = makeEquipment();

    const created = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipment_id: item.id, requested_start: '2025-03-10', due_date: '2025-03-15' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.due_date).toBe('2025-03-17');

    const tooLong = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipment_id: item.id, requested_start: '2025-03-10', due_date: '2025-04-10' });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.code).toBe('INVALID_DURATION');
  });

  test('Rule 5: PATCH /api/loans/:id/status is restricted to staff', async () => {
    const student = await makeUser('STUDENT');
    const tech = await makeUser('TECHNICIAN');
    const loan = makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });

    const denied = await request(app)
      .patch(`/api/loans/${loan.id}/status`)
      .set('Authorization', `Bearer ${await tokenFor(student)}`)
      .send({ status: 'APPROVED' });
    expect(denied.status).toBe(403);

    const approved = await request(app)
      .patch(`/api/loans/${loan.id}/status`)
      .set('Authorization', `Bearer ${await tokenFor(tech)}`)
      .send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  test('Rule 8 via API: rejecting without a reason returns 400', async () => {
    const student = await makeUser('STUDENT');
    const admin = await makeUser('ADMIN');
    const loan = makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });
    const res = await request(app)
      .patch(`/api/loans/${loan.id}/status`)
      .set('Authorization', `Bearer ${await tokenFor(admin)}`)
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  test('GET /api/loans returns own loans for students and all loans for staff', async () => {
    const [a, b] = [await makeUser('STUDENT'), await makeUser('STUDENT')];
    const tech = await makeUser('TECHNICIAN');
    makeLoan(a, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });
    makeLoan(b, makeEquipment(), { start: '2025-03-12', due: '2025-03-14' });

    const own = await request(app).get('/api/loans').set('Authorization', `Bearer ${await tokenFor(a)}`);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].user_id).toBe(a.id);

    const all = await request(app).get('/api/loans').set('Authorization', `Bearer ${await tokenFor(tech)}`);
    expect(all.body).toHaveLength(2);
  });
});
