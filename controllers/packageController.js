const Package = require('../models/Package');

// @desc    Get all packages
// @route   GET /api/admin/packages
// @access  Private/Admin
exports.getPackages = async (req, res) => {
  try {
    const packages = await Package.find().sort({ order: 1, createdAt: -1 });
    res.json({
      success: true,
      data: packages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get public packages (for payment page)
// @route   GET /api/packages
// @access  Public
exports.getPublicPackages = async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true }).sort({ order: 1, price: 1 });
    res.json({
      success: true,
      data: packages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create package
// @route   POST /api/admin/packages
// @access  Private/Admin
exports.createPackage = async (req, res) => {
  try {
    const { name, description, price, days, devices, features, icon, isActive, order, popular } = req.body;
    
    const package = await Package.create({
      name,
      description,
      price,
      days,
      devices,
      features,
      icon,
      isActive,
      order,
      popular
    });
    
    res.json({
      success: true,
      data: package
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update package
// @route   PUT /api/admin/packages/:id
// @access  Private/Admin
exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const package = await Package.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }
    
    res.json({
      success: true,
      data: package
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete package
// @route   DELETE /api/admin/packages/:id
// @access  Private/Admin
exports.deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const package = await Package.findByIdAndDelete(id);
    
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};