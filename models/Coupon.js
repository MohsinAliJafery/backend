// backend/models/Coupon.js
const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  minimumOrderAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxDiscountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  usageLimit: {
    type: Number,
    required: true,
    min: 1
  },
  usedCount: {
    type: Number,
    default: 0
  },
  validFrom: {
    type: Date,
    required: true
  },
  validTo: {
    type: Date,
    required: true
  },
  applicablePlans: [{
    type: String,
    enum: ['trial_days', 'weekly_sub', 'monthly_sub', 'yearly_sub']
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  description: {
    type: String,
    default: ''
  },
  applicablePackages: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Package'
}],
}, {
  timestamps: true
});

// Index for faster queries
couponSchema.index({ code: 1 });
couponSchema.index({ status: 1, validFrom: 1, validTo: 1 });

module.exports = mongoose.model('Coupon', couponSchema);