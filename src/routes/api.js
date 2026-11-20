const express = require('express');
const { requireApiAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const apiController = require('../controllers/apiController');

const router = express.Router();

router.use(express.json({ limit: '100kb' }));

router.post('/auth/login', asyncHandler(apiController.login));

router.use(requireApiAuth);
router.get('/equipment', apiController.listEquipment);
router.get('/equipment/:id(\\d+)', apiController.getEquipment);
router.get('/loans', apiController.listLoans);
router.post('/loans', asyncHandler(apiController.createLoan));
router.patch('/loans/:id(\\d+)/status', apiController.updateLoanStatus);

module.exports = router;
