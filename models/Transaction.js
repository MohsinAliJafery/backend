const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: String, // Firebase UID
    required: true,
    index: true
  },
  // New package fields (replaces subscriptionType)
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: false,
    index: true
  },
  packageName: {
    type: String,
    required: false
  },
  packageDays: {
    type: Number,
    required: false
  },
  // Keep for backward compatibility, but make optional
  subscriptionType: {
    type: String,
    enum: ['weekly_sub', 'monthly_sub', 'yearly_sub', 'trial_days'],
    required: false // Changed from true to false
  },
  amount: {
    type: Number,
    required: true
  },
  originalAmount: {
    type: Number,
    required: false
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    required: false
  },
  currency: {
    type: String,
    default: 'USD',
    required: true
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
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
    required: true
  },
  completedAt: {
    type: Date
  },
  // PayPal specific fields
  captureId: {
    type: String,
    required: false
  },
  paypalOrderId: {
    type: String,
    required: false
  },
  // PayTM specific fields
  bankTxnId: {
    type: String,
    required: false
  },
  txnDate: {
    type: String,
    required: false
  },
  paymentMode: {
    type: String,
    required: false
  },
  // Payer information
  payerEmail: {
    type: String,
    required: false
  },
  payerName: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create indexes for better query performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ packageId: 1 });

// Update the updatedAt field on save
transactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);