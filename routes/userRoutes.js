// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User"); // your Mongoose User model
const { protect } = require('../middleware/auth');

// Create user if doesn't exist
router.post("/sync", protect, async (req, res) => {
  try {
    const { uid, name, email, photoURL, provider } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    let user = await User.findOne({ uid });

    if (!user) {
      // Create new user
      user = await User.create({
        uid,
        name,
        email,
        photoURL,
        provider,
        subscription: "free_trial",
        role: req.user.role || "user",
      });
      console.log("New user added to MongoDB:", uid);
    } else {
      user.name = name || user.name;
      user.email = email || user.email;
      user.photoURL = photoURL || user.photoURL;
      user.provider = provider || user.provider;
      user.role = req.user.role || user.role;

      await user.save();
      console.log("Existing user updated:", uid);
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error syncing user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
