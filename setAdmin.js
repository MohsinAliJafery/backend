const admin = require("firebase-admin");
const serviceAccount = require("./config/service_account.json")

// Initialize Firebase Admin (if not already done)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Set admin claim for a specific user
const setAdmin = async (uid) => {
  try {
    await admin.auth().setCustomUserClaims(uid, { role: "admin" });
    console.log("Admin claim set for user:", uid);
  } catch (error) {
    console.error(error);
  }
};

// Example
setAdmin("I0fyGJ9m1sb48bzTv4bp9euxqd33");
