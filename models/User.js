// backend/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true },
  photoURL: String,
  provider: String,
  subscription: { type: String, default: "free_trial" }, // free_trial, weekly, monthly, yearly
  subscriptionStatus: { type: String, default: "inactive" }, // active, inactive, expired
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  lastPaymentDate: Date,
  lastPaymentMethod: String,
  lastTransactionId: String,
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);