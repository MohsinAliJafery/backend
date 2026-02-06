const paypal = require('@paypal/checkout-server-sdk');

// Configure PayPal environment
let environment;
let client;

try {
  if (process.env.PAYPAL_MODE === 'live') {
    environment = new paypal.core.LiveEnvironment(
      process.env.PAYPAL_CLIENT_ID,
      process.env.PAYPAL_CLIENT_SECRET
    );
  } else {
    environment = new paypal.core.SandboxEnvironment(
      process.env.PAYPAL_CLIENT_ID,
      process.env.PAYPAL_CLIENT_SECRET
    );
  }
  
  client = new paypal.core.PayPalHttpClient(environment);
} catch (error) {
  console.error('PayPal configuration error:', error);
  client = null;
}

module.exports = client;