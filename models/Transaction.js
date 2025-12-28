const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paymentMethod: {
    type: String,
    enum: ['paypal', 'paytm'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentId: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    required: true
  },
  subscriptionType: {
    type: String,
      enum: [
    'trial_days',
    'weekly_sub',
    'monthly_sub',
    'yearly_sub'
  ],
    required: true
  },
  payerEmail: String,
  payerName: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
});

module.exports = mongoose.model('Transaction', transactionSchema);