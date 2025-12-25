const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  discount: Number,
  isUsed: { type: Boolean, default: false },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  usedAt: Date,
});
module.exports = mongoose.model("coupon", couponSchema);