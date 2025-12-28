const express = require('express');
const {
  createPaypalOrder,
  capturePaypalOrder,
  initiatePaytmPayment,
  paytmCallback,
  getUserTransactions
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/paypal/create-order', protect, createPaypalOrder);
router.post('/paypal/capture-order', protect, capturePaypalOrder);
router.post('/paytm/initiate', protect, initiatePaytmPayment);
router.post('/paytm/callback', paytmCallback);
router.get('/transactions', protect, getUserTransactions);

module.exports = router;