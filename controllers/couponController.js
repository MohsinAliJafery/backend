// backend/routes/couponRoutes.js
const Coupon = require('../models/Coupon');

// Get all coupons
exports.getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single coupon
exports.getOneCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ 
      code: req.params.code.toUpperCase(),
      status: 'active',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }
    
    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit exceeded' });
    }
    
    res.json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create coupon
exports.createCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    
    // Check if coupon already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    
    const coupon = new Coupon({
      ...req.body,
      code: code.toUpperCase()
    });
    
    await coupon.save();
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { ...req.body, code: req.body.code.toUpperCase() },
      { new: true, runValidators: true }
    );
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    res.json({ success: true, data: coupon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Validate coupon
exports.validateCoupon = async (req, res) => {
  try {
    const { code, planKey, amount } = req.body;
    
    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      status: 'active',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }
    
    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit exceeded' });
    }
    
    // Check if coupon applies to this plan
    if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
      if (!coupon.applicablePlans.includes(planKey)) {
        return res.status(400).json({ success: false, message: 'Coupon not applicable for this plan' });
      }
    }
    
    // Check minimum order amount
    if (coupon.minimumOrderAmount > 0 && amount < coupon.minimumOrderAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order amount of $${coupon.minimumOrderAmount} required` 
      });
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (amount * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, amount);
    }
    
    const finalAmount = amount - discountAmount;
    
    res.json({ 
      success: true, 
      data: {
        coupon,
        discountAmount,
        finalAmount,
        originalAmount: amount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
