const userService = require('../services/userService');
const equipmentService = require('../services/equipmentService');
const loanService = require('../services/loanService');

async function login(req, res) {
  const { email, password } = req.body || {};
  const user = await userService.authenticate(email, password);
  const token = userService.issueToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

function listEquipment(req, res) {
  res.json(equipmentService.search(req.query));
}

function getEquipment(req, res) {
  res.json(equipmentService.getForDisplay(Number(req.params.id)));
}

function listLoans(req, res) {
  loanService.runScheduledChecks();
  res.json(loanService.listVisibleTo(req.user, req.query));
}

async function createLoan(req, res) {
  const loan = await loanService.requestLoan(req.user, req.body || {});
  res.status(201).json(loan);
}

function updateLoanStatus(req, res) {
  const loan = loanService.changeStatus(req.user, Number(req.params.id), req.body || {});
  res.json(loan);
}

module.exports = { login, listEquipment, getEquipment, listLoans, createLoan, updateLoanStatus };
