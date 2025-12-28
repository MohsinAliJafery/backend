const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

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