const axios = require('axios');
const { clearAllData } = require('../src/config/database');
const clock = require('../src/utils/clock');
const holidayService = require('../src/services/holidayService');
const userService = require('../src/services/userService');
const userRepository = require('../src/repositories/userRepository');
const equipmentRepository = require('../src/repositories/equipmentRepository');
const loanRepository = require('../src/repositories/loanRepository');

const DEFAULT_PASSWORD = 'Password123';
let seq = 0;

// Pin "today" to a given local calendar date (mid-morning to stay clear of midnight).
function setToday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  clock.now = () => new Date(y, m - 1, d, 10, 0, 0);
}

function resetState() {
  clearAllData();
  holidayService.clearCache();
  clock.now = () => new Date();
  // Default: holiday API unreachable -> fallback list is used.
  axios.get.mockReset();
  axios.get.mockRejectedValue(new Error('network disabled in tests'));
}

async function makeUser(role = 'STUDENT', overrides = {}) {
  seq += 1;
  const passwordHash = await userService.hashPassword(overrides.password || DEFAULT_PASSWORD);
  return userRepository.create({
    name: overrides.name || `${role} ${seq}`,
    email: overrides.email || `${role.toLowerCase()}${seq}@test.edu`,
    passwordHash,
    role,
  });
}

function makeEquipment(overrides = {}) {
  seq += 1;
  return equipmentRepository.create({
    name: overrides.name || `Oscilloscope ${seq}`,
    description: overrides.description || 'A **test** device',
    category: overrides.category || 'Oscilloscope',
    serialNumber: overrides.serialNumber || `SN-${seq}`,
    status: overrides.status || 'AVAILABLE',
  });
}

// GETs a page with the given agent (keeping its session) and extracts the CSRF token from its HTML.
async function getCsrf(agent, path = '/profile') {
  const res = await agent.get(path);
  const match = /name="_csrf" value="([^"]+)"/.exec(res.text) || /[?&]_csrf=([^"&]+)/.exec(res.text);
  if (!match) throw new Error(`No CSRF token found on ${path} (status ${res.status})`);
  return match[1];
}

// Inserts a loan directly in a given state (bypasses business rules, for arranging test data).
function makeLoan(user, equipment, { start, due, status = 'PENDING' }) {
  const loan = loanRepository.create({
    userId: user.id,
    equipmentId: equipment.id,
    requestedStart: start,
    dueDate: due,
  });
  if (status !== 'PENDING') loanRepository.updateStatus(loan.id, status);
  return loanRepository.findById(loan.id);
}

module.exports = { DEFAULT_PASSWORD, setToday, resetState, makeUser, makeEquipment, makeLoan, getCsrf };
