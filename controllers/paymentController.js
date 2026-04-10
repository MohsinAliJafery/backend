// backend/controllers/paymentController.js
const paypalClient = require('../config/paypal');
const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const Coupon = require('../models/Coupon');
const User = require('../models/User'); // Import User model
const PaytmChecksum = require('../utils/paytmChecksum');

// Temporary storage for PayTM transaction data (use Redis in production)
const tempStorage = new Map();

// Helper functions for temporary storage
async function getTempTransactionData(orderId) {
  return tempStorage.get(orderId);
}

async function saveTempTransactionData(orderId, data) {
  tempStorage.set(orderId, data);
  // Auto delete after 1 hour
  setTimeout(() => tempStorage.delete(orderId), 3600000);
}

async function deleteTempTransactionData(orderId) {
  tempStorage.delete(orderId);
}

// Helper function to calculate subscription end date
function getSubscriptionEndDate(subscriptionType) {
  const now = new Date();
  switch (subscriptionType) {
    case 'weekly_sub':
      return new Date(now.setDate(now.getDate() + 7));
    case 'monthly_sub':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'yearly_sub':
      return new Date(now.setFullYear(now.getFullYear() + 1));
    case 'trial_days':
      return new Date(now.setDate(now.getDate() + 7));
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

// Helper function to update user subscription in MongoDB
async function updateUserSubscription(uid, subscriptionType, transactionId, paymentMethod) {
  try {
    const endDate = getSubscriptionEndDate(subscriptionType);
    
    // Convert subscription type to readable format
    let subscriptionPlan = '';
    switch (subscriptionType) {
      case 'weekly_sub':
        subscriptionPlan = 'weekly';
        break;
      case 'monthly_sub':
        subscriptionPlan = 'monthly';
        break;
      case 'yearly_sub':
        subscriptionPlan = 'yearly';
        break;
      case 'trial_days':
        subscriptionPlan = 'trial';
        break;
      default:
        subscriptionPlan = 'monthly';
    }
    
    const updatedUser = await User.findOneAndUpdate(
      { uid: uid },
      {
        subscription: subscriptionPlan,
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: endDate,
        lastPaymentDate: new Date(),
        lastPaymentMethod: paymentMethod,
        lastTransactionId: transactionId,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!updatedUser) {
      console.error('User not found for uid:', uid);
      return false;
    }
    
    console.log(`User subscription updated for ${uid}: ${subscriptionPlan} until ${endDate}`);
    return true;
  } catch (error) {
    console.error('Error updating user subscription:', error);
    return false;
  }
}

// @desc    Create PayPal order
// @route   POST /api/payments/paypal/create-order
// @access  Private
exports.createPaypalOrder = async (req, res) => {
  try {
    const { subscriptionType, couponCode, discountedAmount } = req.body;
    
    // Get settings or use defaults
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        freeTrialDays: 7,
        weeklyPrice: 9.99,
        monthlyPrice: 29.99,
        yearlyPrice: 299.99,
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
    
    let originalAmount;
    switch (subscriptionType) {
      case 'weekly_sub':
        originalAmount = settings.weeklyPrice;
        break;
      case 'monthly_sub':
        originalAmount = settings.monthlyPrice;
        break;
      case 'yearly_sub':
        originalAmount = settings.yearlyPrice;
        break;
      case 'trial_days':
        originalAmount = 0.01; // PayPal minimum
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid subscription type'
        });
    }

    let finalAmount = originalAmount;
    let appliedCoupon = null;
    let discountAmount = 0;

    // Apply coupon if provided
    if (couponCode && originalAmount > 0) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        status: 'active',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      });
      
      if (coupon && coupon.usedCount < coupon.usageLimit) {
        if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
          if (coupon.applicablePlans.includes(subscriptionType)) {
            if (coupon.discountType === 'percentage') {
              discountAmount = (originalAmount * coupon.discountValue) / 100;
              if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
                discountAmount = coupon.maxDiscountAmount;
              }
            } else {
              discountAmount = Math.min(coupon.discountValue, originalAmount);
            }
            finalAmount = originalAmount - discountAmount;
            appliedCoupon = coupon;
          }
        } else {
          if (coupon.discountType === 'percentage') {
            discountAmount = (originalAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
              discountAmount = coupon.maxDiscountAmount;
            }
          } else {
            discountAmount = Math.min(coupon.discountValue, originalAmount);
          }
          finalAmount = originalAmount - discountAmount;
          appliedCoupon = coupon;
        }
      }
    }

    if (discountedAmount && discountedAmount > 0) {
      finalAmount = discountedAmount;
    }

    finalAmount = Math.max(0, finalAmount).toFixed(2);
    
    console.log('Creating PayPal order:', {
      subscriptionType,
      originalAmount,
      finalAmount,
      couponCode: couponCode || 'none',
      currency: settings.currency
    });

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: settings.currency || 'USD',
          value: finalAmount,
          breakdown: {
            item_total: {
              currency_code: settings.currency || 'USD',
              value: finalAmount
            }
          }
        },
        description: `${subscriptionType} subscription`,
        custom_id: JSON.stringify({
          subscriptionType,
          originalAmount,
          couponCode: couponCode || null,
          discountAmount: discountAmount
        })
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
    
    await saveTempTransactionData(order.result.id, {
      userId: req.user.uid,
      subscriptionType: subscriptionType,
      originalAmount: originalAmount,
      finalAmount: parseFloat(finalAmount),
      discountAmount: discountAmount,
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      currency: settings.currency || 'USD',
      createdAt: new Date()
    });

    console.log('PayPal order created successfully:', order.result.id);

    res.json({
      success: true,
      data: {
        orderID: order.result.id,
        amount: finalAmount,
        originalAmount: originalAmount,
        discountApplied: discountAmount,
        subscriptionType: subscriptionType,
        couponInfo: appliedCoupon ? {
          code: appliedCoupon.code,
          discountAmount: discountAmount
        } : null
      }
    });
  } catch (error) {
    console.error('PayPal order creation error:', error);
    
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
    
    console.log('Capturing PayPal order:', orderID);
    
    const tempData = await getTempTransactionData(orderID);
    
    if (!tempData) {
      console.error('No temp data found for order:', orderID);
      return res.status(400).json({
        success: false,
        message: 'Order data not found. Please try again.'
      });
    }
    
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await paypalClient.execute(request);
    
    console.log('PayPal capture response:', JSON.stringify(capture.result, null, 2));
    
    if (capture.result.status === 'COMPLETED') {
      const purchaseUnit = capture.result.purchase_units[0];
      const captureDetails = purchaseUnit.payments.captures[0];
      const capturedAmount = parseFloat(captureDetails.amount.value);
      const currency = captureDetails.amount.currency_code;
      
      console.log('Payment captured successfully:', {
        captureId: captureDetails.id,
        amount: capturedAmount,
        currency: currency
      });
      
      // Create transaction
      const transactionData = {
        user: tempData.userId,
        amount: capturedAmount,
        originalAmount: tempData.originalAmount,
        currency: currency,
        paymentMethod: 'paypal',
        paymentId: orderID,
        orderId: orderID,
        subscriptionType: tempData.subscriptionType,
        status: 'completed',
        completedAt: new Date(),
        payerEmail: capture.result.payer.email_address,
        payerName: `${capture.result.payer.name.given_name} ${capture.result.payer.name.surname}`,
        captureId: captureDetails.id,
        paypalOrderId: capture.result.id
      };
      
      if (tempData.couponCode) {
        transactionData.couponCode = tempData.couponCode;
        transactionData.discountAmount = tempData.discountAmount;
      }
      
      const transaction = await Transaction.create(transactionData);
      
      // Update coupon usage
      if (tempData.couponCode) {
        const coupon = await Coupon.findOne({ code: tempData.couponCode.toUpperCase() });
        if (coupon) {
          await Coupon.findByIdAndUpdate(coupon._id, {
            $inc: { usedCount: 1 }
          });
          console.log(`Coupon ${tempData.couponCode} usage incremented`);
        }
      }
      
      // Update user subscription in MongoDB
      const subscriptionUpdated = await updateUserSubscription(
        tempData.userId,
        tempData.subscriptionType,
        transaction._id.toString(),
        'paypal'
      );
      
      if (!subscriptionUpdated) {
        console.error('Failed to update user subscription in MongoDB');
      }
      
      await deleteTempTransactionData(orderID);
      
      res.json({
        success: true,
        message: 'Payment captured successfully',
        data: {
          capture: captureDetails,
          transaction: transaction,
          orderId: orderID
        }
      });
    } else {
      console.log('Payment not completed. Status:', capture.result.status);
      await deleteTempTransactionData(orderID);
      
      res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${capture.result.status}`
      });
    }
  } catch (error) {
    console.error('PayPal capture error:', error);
    
    if (req.body.orderID) {
      await deleteTempTransactionData(req.body.orderID);
    }
    
    let errorMessage = error.message;
    if (error.statusCode === 422) {
      errorMessage = 'The order has already been captured or is invalid.';
    } else if (error.statusCode === 401) {
      errorMessage = 'PayPal authentication failed. Please check your API credentials.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// @desc    Initiate PayTM payment
// @route   POST /api/payments/paytm/initiate
// @access  Private
exports.initiatePaytmPayment = async (req, res) => {
  try {
    const { subscriptionType, amount, currency, user, couponCode } = req.body;
    
    console.log('PayTM initiation request:', {
      subscriptionType,
      amount,
      userId: user?.uid,
      couponCode: couponCode || 'none'
    });
    
    if (!subscriptionType || !amount || !user?.uid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        freeTrialDays: 7,
        weeklyPrice: 9.99,
        monthlyPrice: 29.99,
        yearlyPrice: 299.99,
        currency: 'INR',
        paypalEnabled: true,
        paytmEnabled: true
      });
    }

    let finalAmount = parseFloat(amount);
    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode && finalAmount > 0) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        status: 'active',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      });
      
      if (coupon && coupon.usedCount < coupon.usageLimit) {
        if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
          if (coupon.applicablePlans.includes(subscriptionType)) {
            if (coupon.discountType === 'percentage') {
              discountAmount = (finalAmount * coupon.discountValue) / 100;
              if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
                discountAmount = coupon.maxDiscountAmount;
              }
            } else {
              discountAmount = Math.min(coupon.discountValue, finalAmount);
            }
            finalAmount = finalAmount - discountAmount;
            appliedCoupon = coupon;
          }
        } else {
          if (coupon.discountType === 'percentage') {
            discountAmount = (finalAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
              discountAmount = coupon.maxDiscountAmount;
            }
          } else {
            discountAmount = Math.min(coupon.discountValue, finalAmount);
          }
          finalAmount = finalAmount - discountAmount;
          appliedCoupon = coupon;
        }
      }
    }

    finalAmount = Math.max(0, finalAmount).toFixed(2);
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    
    console.log('Base URL for callback:', baseUrl);

    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await saveTempTransactionData(orderId, {
      userId: user.uid,
      originalAmount: parseFloat(amount),
      finalAmount: parseFloat(finalAmount),
      subscriptionType: subscriptionType,
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      discountAmount: discountAmount,
      currency: 'INR',
      createdAt: new Date()
    });

    const paytmParams = {
      MID: process.env.PAYTM_MERCHANT_ID,
      ORDER_ID: orderId,
      CUST_ID: user.uid,
      INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE_ID || 'Retail',
      CHANNEL_ID: process.env.PAYTM_CHANNEL_ID || 'WEB',
      TXN_AMOUNT: finalAmount.toString(),
      WEBSITE: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
      CALLBACK_URL: `${baseUrl}/api/payments/paytm/callback`,
      EMAIL: user.email || 'customer@example.com',
      MOBILE_NO: user.phone || '9999999999'
    };
    
    console.log('Generated PayTM Params:', paytmParams);

    const merchantKey = process.env.PAYTM_MERCHANT_KEY;
    if (!merchantKey) {
      throw new Error('PAYTM_MERCHANT_KEY not configured');
    }
    
    const checksum = await PaytmChecksum.generateSignature(paytmParams, merchantKey);
    
    console.log('Checksum generated successfully');

    res.json({
      success: true,
      message: 'PayTM order created',
      data: {
        orderId,
        amount: finalAmount,
        originalAmount: amount,
        discountAmount: discountAmount,
        paytmParams: {
          ...paytmParams,
          CHECKSUMHASH: checksum
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

// @desc    PayTM callback handler
// @route   POST /api/payments/paytm/callback
// @access  Public
exports.paytmCallback = async (req, res) => {
  try {
    console.log('========== PAYTM CALLBACK RECEIVED ==========');
    console.log('Raw body:', req.body);
    
    const callbackData = req.body;
    
    if (!callbackData || Object.keys(callbackData).length === 0) {
      console.error('Empty callback data received');
      return res.status(400).send('Invalid callback data');
    }
    
    const {
      ORDERID,
      TXNAMOUNT,
      CURRENCY,
      STATUS,
      RESPCODE,
      RESPMSG,
      BANKTXNID,
      TXNDATE,
      PAYMENTMODE,
      CHECKSUMHASH
    } = callbackData;
    
    console.log('Parsed callback data:', {
      ORDERID,
      TXNAMOUNT,
      STATUS,
      RESPCODE,
      RESPMSG
    });
    
    if (CHECKSUMHASH) {
      const merchantKey = process.env.PAYTM_MERCHANT_KEY;
      const isValidChecksum = await PaytmChecksum.verifySignature(
        callbackData,
        merchantKey,
        CHECKSUMHASH
      );
      
      console.log('Checksum verification:', isValidChecksum);
      
      if (!isValidChecksum) {
        console.warn('Invalid checksum received');
      }
    }
    
    let transaction = await Transaction.findOne({ orderId: ORDERID });
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    if (STATUS === 'TXN_SUCCESS') {
      console.log('Payment SUCCESSFUL:', ORDERID);
      
      if (transaction) {
        console.log('Transaction already exists, returning existing:', ORDERID);
        return res.redirect(
          `${frontendUrl}/payment-success?orderId=${ORDERID}&amount=${TXNAMOUNT}&status=success&transactionId=${transaction._id}`
        );
      }
      
      const tempData = await getTempTransactionData(ORDERID);
      
      if (!tempData) {
        console.error('No temp data found for ORDERID:', ORDERID);
        return res.redirect(`${frontendUrl}/payment-error?message=Transaction data missing`);
      }
      
      const transactionData = {
        user: tempData.userId,
        amount: parseFloat(TXNAMOUNT),
        originalAmount: tempData.originalAmount,
        currency: CURRENCY || 'INR',
        paymentMethod: 'paytm',
        paymentId: ORDERID,
        orderId: ORDERID,
        subscriptionType: tempData.subscriptionType,
        status: 'completed',
        completedAt: new Date(),
        payerEmail: callbackData.EMAIL,
        bankTxnId: BANKTXNID,
        txnDate: TXNDATE,
        paymentMode: PAYMENTMODE
      };
      
      if (tempData.couponCode) {
        transactionData.couponCode = tempData.couponCode;
        transactionData.discountAmount = tempData.discountAmount;
      }
      
      transaction = await Transaction.create(transactionData);
      
      if (tempData.couponCode) {
        const coupon = await Coupon.findOne({ code: tempData.couponCode });
        if (coupon) {
          await Coupon.findByIdAndUpdate(coupon._id, {
            $inc: { usedCount: 1 }
          });
          console.log(`Coupon ${tempData.couponCode} usage incremented`);
        }
      }
      
      // Update user subscription in MongoDB
      const subscriptionUpdated = await updateUserSubscription(
        tempData.userId,
        tempData.subscriptionType,
        transaction._id.toString(),
        'paytm'
      );
      
      if (!subscriptionUpdated) {
        console.error('Failed to update user subscription in MongoDB');
      }
      
      await deleteTempTransactionData(ORDERID);
      
      return res.redirect(
        `${frontendUrl}/payment-success?orderId=${ORDERID}&amount=${TXNAMOUNT}&status=success&transactionId=${transaction._id}`
      );
      
    } else {
      console.log('Payment NOT SUCCESSFUL:', {
        orderId: ORDERID,
        status: STATUS,
        code: RESPCODE,
        message: RESPMSG
      });
      
      await deleteTempTransactionData(ORDERID);
      
      if (transaction) {
        await Transaction.findOneAndDelete({ orderId: ORDERID });
        console.log('Deleted existing transaction for failed payment:', ORDERID);
      }
      
      if (STATUS === 'PENDING') {
        return res.redirect(
          `${frontendUrl}/payment-pending?orderId=${ORDERID}&status=pending`
        );
      } else {
        return res.redirect(
          `${frontendUrl}/payment-failed?orderId=${ORDERID}&status=${STATUS}&code=${RESPCODE}&message=${encodeURIComponent(RESPMSG)}`
        );
      }
    }
    
  } catch (error) {
    console.error('PayTM callback processing error:', error);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/payment-error?message=${encodeURIComponent(error.message)}`
    );
  }
};

// @desc    Test payment (for development)
// @route   POST /api/payments/test
// @access  Private
exports.testPayment = async (req, res) => {
  try {
    const { amount, plan, couponCode } = req.body;
    const user = req.user;
    
    const orderId = `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let finalAmount = parseFloat(amount || '0.09');
    let discountAmount = 0;
    let appliedCoupon = null;
    
    if (couponCode) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        status: 'active',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      });
      
      if (coupon && coupon.usedCount < coupon.usageLimit) {
        if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
          if (coupon.applicablePlans.includes(plan)) {
            if (coupon.discountType === 'percentage') {
              discountAmount = (finalAmount * coupon.discountValue) / 100;
              if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
                discountAmount = coupon.maxDiscountAmount;
              }
            } else {
              discountAmount = Math.min(coupon.discountValue, finalAmount);
            }
            finalAmount = finalAmount - discountAmount;
            appliedCoupon = coupon;
          }
        } else {
          if (coupon.discountType === 'percentage') {
            discountAmount = (finalAmount * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
              discountAmount = coupon.maxDiscountAmount;
            }
          } else {
            discountAmount = Math.min(coupon.discountValue, finalAmount);
          }
          finalAmount = finalAmount - discountAmount;
          appliedCoupon = coupon;
        }
      }
    }
    
    finalAmount = Math.max(0, finalAmount).toFixed(2);
    
    const transactionData = {
      user: user.uid,
      amount: parseFloat(finalAmount),
      originalAmount: parseFloat(amount || '0.09'),
      currency: 'INR',
      paymentMethod: 'test',
      paymentId: orderId,
      orderId: orderId,
      subscriptionType: plan,
      status: 'completed',
      completedAt: new Date()
    };
    
    if (appliedCoupon) {
      transactionData.couponCode = appliedCoupon.code;
      transactionData.discountAmount = discountAmount;
    }
    
    const transaction = await Transaction.create(transactionData);
    
    if (appliedCoupon) {
      await Coupon.findByIdAndUpdate(appliedCoupon._id, {
        $inc: { usedCount: 1 }
      });
      console.log(`Coupon ${appliedCoupon.code} usage incremented`);
    }
    
    // Update user subscription in MongoDB
    const subscriptionUpdated = await updateUserSubscription(
      user.uid,
      plan,
      transaction._id.toString(),
      'test'
    );
    
    if (!subscriptionUpdated) {
      console.error('Failed to update user subscription in MongoDB');
    }
    
    res.json({
      success: true,
      message: 'Test payment successful',
      data: {
        orderId,
        transactionId: transaction._id,
        amount: finalAmount,
        originalAmount: amount,
        discountAmount: discountAmount,
        redirectUrl: `${process.env.FRONTEND_URL}/payment-success?orderId=${orderId}&status=TXN_SUCCESS&amount=${finalAmount}&test=true`
      }
    });
    
  } catch (error) {
    console.error('Test payment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify payment status
// @route   GET /api/payments/verify/:orderId
// @access  Private
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const transaction = await Transaction.findOne({ 
      orderId: orderId,
      user: req.user.uid 
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        status: transaction.status,
        amount: transaction.amount,
        subscriptionType: transaction.subscriptionType,
        completedAt: transaction.completedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get subscription details
// @route   GET /api/payments/subscription
// @access  Private
exports.getSubscriptionDetails = async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const subscription = {
      type: user.subscription || 'free_trial',
      status: user.subscriptionStatus || 'inactive',
      startDate: user.subscriptionStartDate || null,
      endDate: user.subscriptionEndDate || null,
      lastPaymentDate: user.lastPaymentDate || null,
      lastPaymentMethod: user.lastPaymentMethod || null
    };
    
    // Check if subscription is expired
    if (subscription.endDate && new Date() > new Date(subscription.endDate)) {
      subscription.status = 'expired';
      // Update in database
      await User.findOneAndUpdate(
        { uid: req.user.uid },
        { subscriptionStatus: 'expired' }
      );
    }
    
    res.json({
      success: true,
      data: subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};