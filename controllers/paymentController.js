const paypalClient = require('../config/paypal');
const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const PaytmChecksum = require('../utils/paytmChecksum');
const axios = require('axios');

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
    amount = settings.yearlyPrice.toString(); // 🔥 ADD THIS
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

// @desc    Initiate PayTM payment
// @route   POST /api/payments/paytm/initiate
// @access  Private
exports.initiatePaytmPayment = async (req, res) => {
  try {
    const { subscriptionType } = req.body;
    
    // Get settings from Firebase or default
    let settings = { 
      weeklyPrice: 9.99, 
      monthlyPrice: 29.99,
      yearlyPrice: 299.99,
      currency: "INR"  // PayTM uses INR
    };
    
    let amount;
    switch (subscriptionType) {
      case 'weekly_sub':
        amount = settings.weeklyPrice;
        break;
      case 'monthly_sub':
        amount = settings.monthlyPrice;
        break;
      case 'yearly_sub':
        amount = settings.yearlyPrice;
        break;
      case 'trial_days':
        amount = 1; // Minimum amount for PayTM
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid subscription type'
        });
    }

    // Generate order ID
    const orderId = 'ORDER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Get user info
    const user = req.user || JSON.parse(req.headers.user || '{}');
    
    const transaction = await Transaction.create({
      user: user.uid || user.id || 'unknown',
      amount,
      currency: 'INR', // PayTM uses INR
      paymentMethod: 'paytm',
      paymentId: orderId,
      orderId: orderId,
      subscriptionType,
      status: 'pending'
    });

    // Prepare PayTM parameters
    const paytmParams = {
      MID: process.env.PAYTM_MERCHANT_ID || 'wGTGuY25794243710156',
      ORDER_ID: orderId,
      CUST_ID: user.uid || user.id || 'guest',
      INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE_ID || 'Retail',
      CHANNEL_ID: process.env.PAYTM_CHANNEL_ID || 'WEB',
      TXN_AMOUNT: amount.toString(),
      WEBSITE: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
      CALLBACK_URL: process.env.PAYTM_CALLBACK_URL || 'http://localhost:5000/api/payments/paytm/callback',
      EMAIL: user.email || 'test@example.com',
      MOBILE_NO: user.phone || '9999999999'
    };

    // Generate checksum
    const checksum = await PaytmChecksum.generateSignature(
      paytmParams,
      process.env.PAYTM_MERCHANT_KEY || 'l%FAgDhj0#KDK274'
    );

    res.json({
      success: true,
      data: {
        orderId,
        transactionId: transaction._id,
        paytmParams,
        checksum
      }
    });
  } catch (error) {
    console.error('PayTM initiation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate PayTM payment'
    });
  }
};

// @desc    PayTM callback
// @route   POST /api/payments/paytm/callback
// @access  Public
exports.paytmCallback = async (req, res) => {
  try {
    const paytmChecksum = req.body.CHECKSUMHASH;
    
    // Verify signature
    const isVerifySignature = await PaytmChecksum.verifySignature(
      req.body,
      process.env.PAYTM_MERCHANT_KEY || 'l%FAgDhj0#KDK274',
      paytmChecksum
    );

    if (isVerifySignature) {
      if (req.body.STATUS === 'TXN_SUCCESS') {
        // Update transaction status
        await Transaction.findOneAndUpdate(
          { orderId: req.body.ORDERID },
          {
            status: 'completed',
            completedAt: new Date(),
            payerEmail: req.body.EMAIL,
            payerName: req.body.CUST_ID,
            paytmResponse: req.body
          }
        );
        
        // Update user subscription in Firebase
        const transaction = await Transaction.findOne({ orderId: req.body.ORDERID });
        if (transaction) {
          const user = JSON.parse(localStorage.getItem("user"));
          if (user) {
            const uid = user.uid;
            
            // Get plan days from settings
            // This would need to come from your database
            const planDays = {
              'weekly_sub': 7,
              'monthly_sub': 30,
              'yearly_sub': 365,
              'trial_days': 7
            };
            
            const days = planDays[transaction.subscriptionType] || 7;
            
            const parentRef = ref(database, `parents/${uid}`);
            const snapshot = await get(parentRef);
            
            const now = Date.now();
            const currentExpiry = snapshot.exists() 
              ? snapshot.val()?.subscription?.expiryDate || 0 
              : 0;
            
            const baseTime = currentExpiry > now ? currentExpiry : now;
            const newExpiryDate = baseTime + days * 24 * 60 * 60 * 1000;
            
            await update(parentRef, {
              subscription: { 
                expiryDate: newExpiryDate,
                plan: transaction.subscriptionType,
                updatedAt: Date.now()
              }
            });
          }
        }
        
        // Redirect to success page
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success`);
      } else {
        await Transaction.findOneAndUpdate(
          { orderId: req.body.ORDERID },
          { 
            status: 'failed',
            paytmResponse: req.body
          }
        );
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/failed`);
      }
    } else {
      console.error('Checksum mismatch');
      res.status(400).json({
        success: false,
        message: 'Checksum mismatched'
      });
    }
  } catch (error) {
    console.error('PayTM callback error:', error);
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