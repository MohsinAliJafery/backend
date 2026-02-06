// server/firebase-admin.js
const admin = require('firebase-admin');

function initializeFirebaseAdmin() {
  // Don't reinitialize if already initialized
  if (admin.apps.length > 0) {
    return admin;
  }

  let serviceAccount;
  
  try {
    // Try to load from file first
    serviceAccount = require('./config/service_account.json');
    console.log('Loaded Firebase service account from file');
  } catch (error) {
    console.log('No service account file found, trying environment variables...');
    
    // Check if environment variables exist
    if (!process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase private key not found in environment variables');
    }

    // IMPORTANT: Properly format the private key from environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    serviceAccount = {
      type: process.env.FIREBASE_TYPE || 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
    };
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://kidzet-5cf0a-default-rtdb.firebaseio.com"
    });
    
    console.log('Firebase Admin SDK initialized successfully');
    return admin;
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
    
    // Log detailed error information
    if (error.code === 'auth/invalid-credential') {
      console.error('Credential error details:');
      console.error('- Project ID:', serviceAccount.project_id);
      console.error('- Client Email:', serviceAccount.client_email);
      console.error('- Private Key ID:', serviceAccount.private_key_id);
      console.error('- Private Key Length:', serviceAccount.private_key?.length);
      console.error('- Private Key Starts with:', serviceAccount.private_key?.substring(0, 50));
    }
    
    throw error;
  }
}

// Initialize immediately
const adminInstance = initializeFirebaseAdmin();

module.exports = adminInstance;