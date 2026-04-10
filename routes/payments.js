// backend/routes/paymentRoutes.js
const express = require('express');
const {
  createPaypalOrder,
  capturePaypalOrder,
  initiatePaytmPayment,
  paytmCallback,
  getUserTransactions,
  testPayment
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/paypal/create-order', protect, createPaypalOrder);
router.post('/paypal/capture-order', protect, capturePaypalOrder);
router.post('/paytm/initiate', protect, initiatePaytmPayment);
router.post('/paytm/callback', paytmCallback);
router.get('/paytm/callback', paytmCallback);
router.get('/transactions', protect, getUserTransactions);

router.post('/test-payment', protect, testPayment);

module.exports = router;