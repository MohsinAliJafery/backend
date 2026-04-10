// backend/models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  originalAmount: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    default: null
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  paymentMethod: {
    type: String,
    enum: ['paypal', 'paytm', 'test'],
    required: true
  },
  paymentId: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  subscriptionType: {
    type: String,
    enum: ['weekly_sub', 'monthly_sub', 'yearly_sub', 'trial_days'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  payerEmail: {
    type: String,
    default: null
  },
  payerName: {
    type: String,
    default: null
  },
  captureId: {
    type: String,
    default: null
  },
  bankTxnId: {
    type: String,
    default: null
  },
  txnDate: {
    type: String,
    default: null
  },
  paymentMode: {
    type: String,
    default: null
  },
  failureReason: {
    type: String,
    default: null
  },
  failureCode: {
    type: String,
    default: null
  },
  pendingReason: {
    type: String,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for better query performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ paymentId: 1 });
transactionSchema.index({ couponCode: 1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);