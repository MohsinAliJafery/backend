const paypalClient = require('../config/paypal');
const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const PaytmChecksum = require('../utils/paytmChecksum');
const axios = require('axios');
const admin = require('firebase-admin');

// @desc    Create PayPal order
// @route   POST /api/payments/paypal/create-order
// @access  Private
// @desc    Create PayPal order
// @route   POST /api/payments/paypal/create-order
// @access  Private
exports.createPaypalOrder = async (req, res) => {
  try {
    const { subscriptionType } = req.body;
    
    // Get settings or use defaults
    let settings = await Settings.findOne();
    if (!settings) {
      // Create default settings if none exist
      settings = await Settings.create({
        freeTrialDays: 7,
        weeklyPrice: 9.99,
        monthlyPrice: 29.99,
        currency: 'USD',
        paypalEnabled: true,
        paytmEnabled: true
      });
    }
    
    if (!paypalClient) {
      return res.status(500).json({
        success: false,
        message: 'PayPal client not configured properly'
      });
    }
    
    let amount;

switch (subscriptionType) {
  case 'weekly_sub':
    amount = settings.weeklyPrice.toString();
    break;

  case 'monthly_sub':
    amount = settings.monthlyPrice.toString();
    break;

  case 'yearly_sub':
    amount = settings.yearlyPrice.toString();
    break;

  case 'trial_days':
    amount = '0.01'; // PayPal minimum
    break;

  default:
    return res.status(400).json({
      success: false,
      message: 'Invalid subscription type'
    });
}

    console.log('Creating PayPal order:', {
      subscriptionType,
      amount,
      currency: settings.currency
    });

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: settings.currency || 'USD',
          value: amount
        },
        description: `${subscriptionType} subscription`
      }],
      application_context: {
        brand_name: 'Payment Portal',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment`
      }
    });

    const order = await paypalClient.execute(request);
    
    // Create transaction record
    const transaction = await Transaction.create({
      user: req.user.uid,
      amount: parseFloat(amount),
      currency: settings.currency || 'USD',
      paymentMethod: 'paypal',
      paymentId: order.result.id,
      orderId: order.result.id,
      subscriptionType,
      status: 'pending'
    });

    console.log('PayPal order created successfully:', order.result.id);

    res.json({
      success: true,
      data: {
        orderID: order.result.id,
        transactionId: transaction._id
      }
    });
  } catch (error) {
    console.error('PayPal order creation error:', error);
    
    // More detailed error message
    let errorMessage = 'Failed to create PayPal order';
    if (error.statusCode === 401) {
      errorMessage = 'PayPal authentication failed. Check your client ID and secret.';
    } else if (error.statusCode === 400) {
      errorMessage = 'Invalid request to PayPal. Check the request parameters.';
    } else {
      errorMessage = error.message || errorMessage;
    }

    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

// @desc    Capture PayPal payment
// @route   POST /api/payments/paypal/capture-order
// @access  Private
exports.capturePaypalOrder = async (req, res) => {
  try {
    const { orderID } = req.body;
    
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await paypalClient.execute(request);
    
    // Update transaction
    await Transaction.findOneAndUpdate(
      { paymentId: orderID },
      {
        status: 'completed',
        completedAt: new Date(),
        payerEmail: capture.result.payer.email_address,
        payerName: `${capture.result.payer.name.given_name} ${capture.result.payer.name.surname}`
      }
    );

    res.json({
      success: true,
      data: capture.result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// @desc    Get user transactions
// @route   GET /api/payments/transactions
// @access  Private
exports.getUserTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.uid })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.initiatePaytmPayment = async (req, res) => {
  try {
    const { subscriptionType, amount, currency, user } = req.body;
    
    console.log('PayTM initiation request:', {
      subscriptionType,
      amount,
      currency,
      userId: user?.uid
    });
    
    if (!subscriptionType || !amount || !user?.uid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Get settings from database
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        freeTrialDays: 7,
        weeklyPrice: 9.99,
        monthlyPrice: 29.99,
        yearlyPrice: 299.99,
        currency: 'INR', // Force INR for PayTM
        paypalEnabled: true,
        paytmEnabled: true
      });
    }

    // Use the BASE_URL from .env
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    
    console.log('Base URL for callback:', baseUrl);

    // Generate order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create transaction record
    const transaction = await Transaction.create({
      user: user.uid,
      amount: parseFloat(amount),
      currency: 'INR', // Force INR for PayTM
      paymentMethod: 'paytm',
      paymentId: orderId,
      orderId: orderId,
      subscriptionType,
      status: 'pending'
    });

    // PayTM parameters
    const paytmParams = {
      MID: process.env.PAYTM_MERCHANT_ID,
      ORDER_ID: orderId,
      CUST_ID: user.uid,
      INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE_ID || 'Retail',
      CHANNEL_ID: process.env.PAYTM_CHANNEL_ID || 'WEB',
      TXN_AMOUNT: amount.toString(),
      WEBSITE: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
      CALLBACK_URL: `${baseUrl}/api/payments/paytm/callback`,
      EMAIL: user.email || 'customer@example.com',
      MOBILE_NO: user.phone || '9999999999'
    };
    
    console.log('Generated PayTM Params:', paytmParams);

    // Generate checksum
    const merchantKey = process.env.PAYTM_MERCHANT_KEY;
    if (!merchantKey) {
      throw new Error('PAYTM_MERCHANT_KEY not configured');
    }
    
    const checksum = await PaytmChecksum.generateSignature(paytmParams, merchantKey);
    
    console.log('Checksum generated successfully');

    // IMPORTANT: Return the structure that frontend expects
    res.json({
      success: true,
      message: 'PayTM order created',
      data: {
        orderId,
        transactionId: transaction._id,
        paytmParams: { // This should contain ALL parameters including checksum
          ...paytmParams,
          CHECKSUMHASH: checksum
        },
        // These are optional but good for debugging
        _debug: {
          callbackUrl: paytmParams.CALLBACK_URL,
          checksumLength: checksum.length,
          environment: process.env.NODE_ENV
        }
      }
    });

  } catch (error) {
    console.error('PayTM initiation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
};

exports.paytmCallback = async (req, res) => {
  try {
    console.log('========== PAYTM CALLBACK RECEIVED ==========');
    console.log('Method:', req.method);
    console.log('Raw body:', req.body);
    
    const callbackData = req.body;
    
    if (!callbackData || Object.keys(callbackData).length === 0) {
      console.error('Empty callback data received');
      return res.status(400).send('Invalid callback data');
    }
    
    const {
      ORDERID,
      MID,
      TXNAMOUNT,
      CURRENCY,
      STATUS,
      RESPCODE,
      RESPMSG,
      BANKTXNID,
      TXNDATE,
      GATEWAYNAME,
      PAYMENTMODE,
      CHECKSUMHASH
    } = callbackData;
    
    console.log('Parsed callback data:', {
      ORDERID,
      MID,
      TXNAMOUNT,
      STATUS,
      RESPCODE,
      RESPMSG,
      HAS_CHECKSUM: !!CHECKSUMHASH,
      CHECKSUMHASH: CHECKSUMHASH ? `${CHECKSUMHASH.substring(0, 20)}...` : 'Missing'
    });
    
    // For failed transactions, PayTM might not send checksum
    // We should still process the callback
    if (CHECKSUMHASH) {
      const merchantKey = process.env.PAYTM_MERCHANT_KEY;
      const isValidChecksum = await PaytmChecksum.verifySignature(
        callbackData,
        merchantKey,
        CHECKSUMHASH
      );
      
      console.log('Checksum verification:', isValidChecksum);
      
      if (!isValidChecksum) {
        console.warn('Invalid checksum received. Proceeding with caution...');
        // You might want to log this but still process for failed transactions
      }
    } else {
      console.warn('No checksum received. This is normal for failed transactions.');
    }
    
    // Process the transaction based on status
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    if (STATUS === 'TXN_SUCCESS') {
      console.log('Payment SUCCESSFUL:', ORDERID);
      
      // TODO: Update database with successful payment
      // await processSuccessfulPayment(callbackData);
      
      return res.redirect(
        `${frontendUrl}/payment-success?orderId=${ORDERID}&amount=${TXNAMOUNT}&status=success`
      );
      
    } else if (STATUS === 'PENDING') {
      console.log('Payment PENDING:', ORDERID);
      return res.redirect(
        `${frontendUrl}/payment-pending?orderId=${ORDERID}&status=pending`
      );
      
    } else {
      // TXN_FAILURE or other statuses
      console.log('Payment FAILED:', {
        orderId: ORDERID,
        status: STATUS,
        code: RESPCODE,
        message: RESPMSG
      });
      
      // TODO: Update database with failed payment
      // await processFailedPayment(callbackData);
      
      return res.redirect(
        `${frontendUrl}/payment-failed?orderId=${ORDERID}&status=${STATUS}&code=${RESPCODE}&message=${encodeURIComponent(RESPMSG)}`
      );
    }
    
  } catch (error) {
    console.error('PayTM callback processing error:', error);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/payment-error?message=${encodeURIComponent(error.message)}`
    );
  }
};

// Add this to your paymentController.js

exports.testPayment = async (req, res) => {
  try {
    const { amount, plan } = req.body;
    
    // Generate test order ID
    const orderId = `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create mock PayTM response
    const mockParams = {
      ORDERID: orderId,
      MID: process.env.PAYTM_MERCHANT_ID,
      TXNAMOUNT: amount || '0.09',
      CURRENCY: 'INR',
      STATUS: 'TXN_SUCCESS',
      RESPCODE: '01',
      RESPMSG: 'Payment successful',
      BANKTXNID: `BANK${Date.now()}`,
      TXNDATE: new Date().toISOString(),
      GATEWAYNAME: 'TEST',
      PAYMENTMODE: 'TEST',
      CHECKSUMHASH: 'testchecksum1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefabcd'
    };
    
    // Process successful payment
    const user = req.body.user || { uid: 'test_user' };
    
    res.json({
      success: true,
      message: 'Test payment created',
      data: {
        orderId,
        redirectUrl: `${process.env.FRONTEND_URL}/payment-success?orderId=${orderId}&status=TXN_SUCCESS&amount=${amount || '0.09'}`,
        mockParams,
        note: 'Use this for testing without actual PayTM'
      }
    });
    
  } catch (error) {
    console.error('Test payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
