const express = require('express');
const {
  getPackages,
  getPublicPackages,
  createPackage,
  updatePackage,
  deletePackage
} = require('../controllers/packageController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/admin');

const router = express.Router();

// Public route
router.get('/public', getPublicPackages);

// Admin routes
router.use(protect);
router.use(authorize('admin'));
router.route('/')
  .get(getPackages)
  .post(createPackage);
router.route('/:id')
  .put(updatePackage)
  .delete(deletePackage);

module.exports = router;