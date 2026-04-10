const express = require('express');
const {
  getUsers,
  deleteUser,
  getTransactions,
  getDashboardStats,
  getSettings,
  updateSettings,
  getFirebaseUsers
} = require('../controllers/adminController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/admin');

const router = express.Router();

const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    if (decodedToken.admin !== true) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};


// Apply middleware
router.use(protect);
router.use(authorize('admin'));

// Admin routes
router.get('/users', getUsers);
router.delete('/users/:uid', deleteUser);
router.get('/transactions', getTransactions);
router.get('/stats', getDashboardStats);
router.get('/firebase-users', getFirebaseUsers);
router.route('/settings')
  .get(getSettings)
  .put(updateSettings);

module.exports = router;
