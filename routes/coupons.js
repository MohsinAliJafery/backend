const express = require('express');
const {
  getAllCoupons,
  getOneCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} = require('../controllers/couponController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getAllCoupons);
router.get('/:code', protect, getOneCoupon);
router.post('/', protect, createCoupon);
router.put('/:id', updateCoupon);
router.delete('/:id', deleteCoupon);
router.post('/validate', protect, validateCoupon);

module.exports = router;