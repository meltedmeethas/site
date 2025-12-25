const mongoose = require("mongoose");

const deletedOrderSchema = new mongoose.Schema({
  originalOrderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },

  userDetails: {
    name: String,
    email: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
  },

  items: [
    {
      productId: mongoose.Schema.Types.ObjectId,
      quantity: Number,
      productName: String,
      coverImage: String,
      productdiscountPrice: Number,
    },
  ],

  cancelReason: { type: String, required: true },

  cancelledAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DeletedOrder", deletedOrderSchema);
