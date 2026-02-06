const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const admin = require('../firebase-admin');

// Middleware to verify admin token
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    // Check if user is admin (you need to set custom claims in Firebase)
    if (decodedToken.admin !== true) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

exports.getFirebaseUsers = async (req, res) => {
    try {
    // List all users with pagination
    const maxResults = 100; // Maximum users per request
    let users = [];
    let nextPageToken;
    
    do {
      const listUsersResult = await admin.auth().listUsers(maxResults, nextPageToken);
      users = users.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    const formattedUsers = users.map(user => ({
      uid: user.uid,
      email: user.email || 'No email',
      emailVerified: user.emailVerified || false,
      displayName: user.displayName || 'No name',
      phoneNumber: user.phoneNumber || 'No phone',
      photoURL: user.photoURL || null,
      disabled: user.disabled || false,
      metadata: {
        creationTime: user.metadata.creationTime || null,
        lastSignInTime: user.metadata.lastSignInTime || null,
        lastRefreshTime: user.metadata.lastRefreshTime || null
      },
      providerData: user.providerData.map(provider => ({
        providerId: provider.providerId || 'unknown',
        email: provider.email || 'No email',
        displayName: provider.displayName || 'No name'
      })),
      isAnonymous: !user.email && !user.phoneNumber
    }));

    res.json({
      success: true,
      data: formattedUsers,
      total: formattedUsers.length
    });
  } catch (error) {
    console.error('Error fetching Firebase users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Firebase users',
      error: error.message
    });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all transactions
// @route   GET /api/admin/transactions
// @access  Private/Admin
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('user', 'name email')
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

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const completedTransactions = await Transaction.countDocuments({ status: 'completed' });
    const totalRevenue = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalTransactions,
        completedTransactions,
        totalRevenue: totalRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get settings
// @route   GET /api/admin/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    console.log("Settings Data", settings);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const {
      freeTrialDays,
      weeklyPrice,
      monthlyPrice,
      yearlyPrice,
      currency,
      paypalEnabled,
      paytmEnabled
    } = req.body;

    console.log("YearlyPrice:", yearlyPrice);

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }

    settings.freeTrialDays = freeTrialDays || settings.freeTrialDays;
    settings.weeklyPrice = weeklyPrice || settings.weeklyPrice;
    settings.monthlyPrice = monthlyPrice || settings.monthlyPrice;
    settings.yearlyPrice = yearlyPrice || settings.yearlyPrice;
    settings.currency = currency || settings.currency;
    settings.paypalEnabled = paypalEnabled !== undefined ? paypalEnabled : settings.paypalEnabled;
    settings.paytmEnabled = paytmEnabled !== undefined ? paytmEnabled : settings.paytmEnabled;
    settings.updatedBy = req.user.id;

    await settings.save();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};