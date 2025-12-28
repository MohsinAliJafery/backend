const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true },
  photoURL: String,
  provider: String,
  subscription: { type: String, default: "free_trial" },
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
