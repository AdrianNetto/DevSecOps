jest.mock('axios');

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const config = require('../src/config');
const { createApp } = require('../src/app');
const equipmentRepository = require('../src/repositories/equipmentRepository');
const userRepository = require('../src/repositories/userRepository');
const { resetState, setToday, makeUser, makeEquipment, makeLoan, DEFAULT_PASSWORD } = require('./helpers');

const app = createApp();

// Minimal valid PNG header + padding.
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);

async function loginAgent(user) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: user.email, password: DEFAULT_PASSWORD }).expect(302);
  return agent;
}

beforeEach(() => {
  resetState();
  setToday('2025-03-10');
});

describe('Rule 11: equipment photo upload', () => {
  const fields = { name: 'Scope', category: 'Oscilloscope', status: 'AVAILABLE', description: 'x' };

  test('accepts a PNG and stores it under the uploads directory', async () => {
    const agent = await loginAgent(await makeUser('TECHNICIAN'));
    const res = await agent
      .post('/equipment')
      .field({ ...fields, serial_number: 'UP-1' })
      .attach('photo', PNG, { filename: 'scope.png', contentType: 'image/png' });
    expect(res.status).toBe(302);
    const item = equipmentRepository.findBySerial('UP-1');
    expect(item.photo_path).toMatch(/^\/uploads\/.+\.png$/);
    expect(fs.existsSync(path.join(config.uploadDir, path.basename(item.photo_path)))).toBe(true);
  });

  test('rejects non jpg/png files', async () => {
    const agent = await loginAgent(await makeUser('TECHNICIAN'));
    const res = await agent
      .post('/equipment')
      .field({ ...fields, serial_number: 'UP-2' })
      .attach('photo', Buffer.from('GIF89a'), { filename: 'scope.gif', contentType: 'image/gif' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/equipment/new');
    expect(equipmentRepository.findBySerial('UP-2')).toBeUndefined();
  });

  test('rejects files larger than 2 MB', async () => {
    const agent = await loginAgent(await makeUser('TECHNICIAN'));
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await agent
      .post('/equipment')
      .field({ ...fields, serial_number: 'UP-3' })
      .attach('photo', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(302);
    expect(equipmentRepository.findBySerial('UP-3')).toBeUndefined();
    const page = await agent.get('/equipment/new');
    expect(page.text).toContain('Photo must be at most 2 MB');
  });

  test('students cannot manage equipment', async () => {
    const agent = await loginAgent(await makeUser('STUDENT'));
    const res = await agent.post('/equipment').field({ ...fields, serial_number: 'UP-4' });
    expect(res.status).toBe(403);
  });
});

describe('Web pages and admin features', () => {
  test('catalog supports search and category filter', async () => {
    const agent = await loginAgent(await makeUser('STUDENT'));
    makeEquipment({ name: 'Fluke Meter', category: 'Multimeter' });
    makeEquipment({ name: 'Rigol Scope', category: 'Oscilloscope' });
    const res = await agent.get('/equipment').query({ q: 'fluke', category: 'Multimeter' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Fluke Meter');
    expect(res.text).not.toContain('Rigol Scope');
  });

  test('profile preferences are deep-merged into stored preferences', async () => {
    const user = await makeUser('STUDENT');
    const agent = await loginAgent(user);
    await agent.post('/profile').type('form').send({ name: user.name, preferences: '{"notifications":{"email":true},"theme":"dark"}' });
    await agent.post('/profile').type('form').send({ name: user.name, preferences: '{"notifications":{"sms":false}}' });
    expect(JSON.parse(userRepository.findById(user.id).preferences)).toEqual({
      theme: 'dark',
      notifications: { email: true, sms: false },
    });
  });

  test('admin can export loans as CSV filtered by status and date range; technicians cannot', async () => {
    const student = await makeUser('STUDENT', { name: 'Csv Student' });
    makeLoan(student, makeEquipment(), { start: '2025-03-01', due: '2025-03-05', status: 'RETURNED' });
    makeLoan(student, makeEquipment(), { start: '2025-03-12', due: '2025-03-14', status: 'PENDING' });
    makeLoan(student, makeEquipment(), { start: '2025-02-01', due: '2025-02-05', status: 'RETURNED' });

    const admin = await loginAgent(await makeUser('ADMIN'));
    const res = await admin.get('/admin/reports/loans.csv').query({ status: 'RETURNED', from: '2025-02-15', to: '2025-03-31' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toMatch(/^id,status,user_name/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('RETURNED');

    const tech = await loginAgent(await makeUser('TECHNICIAN'));
    expect((await tech.get('/admin/reports/loans.csv')).status).toBe(403);
  });

  test('admin audit log page lists entries and filters by action', async () => {
    const admin = await makeUser('ADMIN');
    const agent = await loginAgent(admin);
    const target = await makeUser('STUDENT');
    await agent.post(`/admin/users/${target.id}/role`).type('form').send({ role: 'TECHNICIAN' }).expect(302);
    expect(userRepository.findById(target.id).role).toBe('TECHNICIAN');

    const res = await agent.get('/admin/audit').query({ action: 'USER_ROLE_CHANGED' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('USER_ROLE_CHANGED');
    expect(res.text).not.toContain('<code>USER_LOGIN</code>');
  });
});
