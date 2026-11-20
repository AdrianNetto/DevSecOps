const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { requireStaff, requireAdmin } = require('../middleware/roles');
const { parseEquipmentPhoto, discardUploadedFile } = require('../middleware/upload');
const { formAction } = require('../utils/http');
const authController = require('../controllers/authController');
const equipmentController = require('../controllers/equipmentController');
const loanController = require('../controllers/loanController');
const adminController = require('../controllers/adminController');
const profileController = require('../controllers/profileController');

const router = express.Router();

function withPhoto(handler) {
  return async (req, res) => {
    await parseEquipmentPhoto(req, res);
    try {
      handler(req, res);
    } catch (err) {
      discardUploadedFile(req);
      throw err;
    }
  };
}

router.get('/', (req, res) => res.redirect(req.user ? '/equipment' : '/login'));

// Auth
router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.post('/logout', authController.logout);

// Equipment (catalog for everyone logged in; management for staff)
router.get('/equipment', requireLogin, equipmentController.catalog);
router.get('/equipment/new', requireLogin, requireStaff, equipmentController.newForm);
router.post(
  '/equipment',
  requireLogin,
  requireStaff,
  formAction(withPhoto(equipmentController.create), '/equipment/new')
);
router.get('/equipment/:id(\\d+)', requireLogin, equipmentController.detail);
router.get('/equipment/:id(\\d+)/edit', requireLogin, requireStaff, equipmentController.editForm);
router.post(
  '/equipment/:id(\\d+)',
  requireLogin,
  requireStaff,
  formAction(withPhoto(equipmentController.update), (req) => `/equipment/${req.params.id}/edit`)
);
router.post(
  '/equipment/:id(\\d+)/delete',
  requireLogin,
  requireStaff,
  formAction(equipmentController.remove, (req) => `/equipment/${req.params.id}`)
);

// Loans
router.get('/loans/new', requireLogin, loanController.newForm);
router.post(
  '/loans',
  requireLogin,
  formAction(loanController.create, (req) => `/loans/new?equipmentId=${encodeURIComponent(req.body.equipment_id || '')}`)
);
router.get('/loans/mine', requireLogin, loanController.myLoans);
router.post('/loans/:id(\\d+)/cancel', requireLogin, formAction(loanController.cancel, '/loans/mine'));

// Staff
router.get('/staff/dashboard', requireLogin, requireStaff, loanController.dashboard);
router.post('/staff/checks', requireLogin, requireStaff, formAction(loanController.runChecks, '/staff/dashboard'));
router.post('/loans/:id(\\d+)/approve', requireLogin, requireStaff, formAction(loanController.approve, '/staff/dashboard'));
router.post('/loans/:id(\\d+)/reject', requireLogin, requireStaff, formAction(loanController.reject, '/staff/dashboard'));
router.post(
  '/loans/:id(\\d+)/return',
  requireLogin,
  requireStaff,
  formAction(loanController.registerReturn, '/staff/dashboard')
);

// Admin
router.get('/admin/users', requireLogin, requireAdmin, adminController.users);
router.post('/admin/users/:id(\\d+)/role', requireLogin, requireAdmin, formAction(adminController.changeRole, '/admin/users'));
router.post('/admin/users/:id(\\d+)/unlock', requireLogin, requireAdmin, formAction(adminController.unlock, '/admin/users'));
router.get('/admin/audit', requireLogin, requireAdmin, adminController.auditLog);
router.get('/admin/reports', requireLogin, requireAdmin, adminController.reports);
router.get('/admin/reports/loans.csv', requireLogin, requireAdmin, adminController.exportLoansCsv);

// Profile
router.get('/profile', requireLogin, profileController.show);
router.post('/profile', requireLogin, formAction(profileController.update, '/profile'));

module.exports = router;
