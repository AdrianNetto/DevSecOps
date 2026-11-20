jest.mock('axios');

const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const userRepository = require('../src/repositories/userRepository');
const auditRepository = require('../src/repositories/auditRepository');
const clock = require('../src/utils/clock');
const { resetState, makeUser, DEFAULT_PASSWORD } = require('./helpers');

const app = createApp();

beforeEach(() => resetState());

describe('Rule 10: passwords and account lockout', () => {
  test('registration rejects passwords shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({ name: 'Short', email: 'short@test.edu', password: 'abc123', password_confirm: 'abc123' });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/at least 8 characters/);
    expect(userRepository.emailExists('short@test.edu')).toBe(false);
  });

  test('registration stores a bcrypt hash (never the plain password) and creates a STUDENT', async () => {
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({ name: 'New', email: 'New@Test.edu', password: 'longenough1', password_confirm: 'longenough1' });
    expect(res.status).toBe(302);
    const stored = userRepository.findByEmailWithPassword('new@test.edu');
    expect(stored.role).toBe('STUDENT');
    expect(stored.password_hash).not.toBe('longenough1');
    expect(await bcrypt.compare('longenough1', stored.password_hash)).toBe(true);
  });

  test('5 failed logins lock the account for 15 minutes, even for the correct password', async () => {
    const user = await makeUser('STUDENT');
    const start = new Date('2025-03-10T10:00:00Z');
    clock.now = () => start;

    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }
    const fifth = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(fifth.status).toBe(401);

    const locked = await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(locked.status).toBe(423);
    expect(auditRepository.search({ action: 'ACCOUNT_LOCKED' })).toHaveLength(1);

    clock.now = () => new Date(start.getTime() + 14 * 60 * 1000);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD })).status).toBe(423);

    clock.now = () => new Date(start.getTime() + 16 * 60 * 1000);
    const ok = await request(app).post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(userRepository.findById(user.id).failed_login_attempts).toBe(0);
  });

  test('a successful login resets the failed-attempt counter', async () => {
    const user = await makeUser('STUDENT');
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/login').type('form').send({ email: user.email, password: 'nope-nope' });
    }
    const res = await request(app).post('/login').type('form').send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(302);
    expect(userRepository.findById(user.id).failed_login_attempts).toBe(0);
  });
});
