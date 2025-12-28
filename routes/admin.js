const express = require('express');
const {
  getUsers,
  getTransactions,
  getDashboardStats,
  getSettings,
  updateSettings
} = require('../controllers/adminController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/admin');

const router = express.Router();

// Apply middleware
router.use(protect);
router.use(authorize('admin'));

// Admin routes
router.get('/users', getUsers);
router.get('/transactions', getTransactions);
router.get('/stats', getDashboardStats);
router.route('/settings')
  .get(getSettings)
  .put(updateSettings);

module.exports = router;
