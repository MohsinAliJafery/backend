const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  freeTrialDays: {
    type: Number,
    default: 7
  },
  weeklyPrice: {
    type: Number,
    default: 9.99
  },
  monthlyPrice: {
    type: Number,
    default: 29.99
  },
  yearlyPrice: {
    type: Number,
    default: 99.99
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paypalEnabled: {
    type: Boolean,
    default: true
  },
  paytmEnabled: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Settings', settingsSchema);