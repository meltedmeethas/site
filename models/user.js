const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: { type: String, unique: true, required: true },

    password: { type: String, required: true },

    // 🔥 SHIPPING DETAILS
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },

    // 🔥 CART
    cart: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: Number,
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // 🔥 PENDING ORDERS
pendingOrders: [
  {
    orderId: { type: String },
    paymentId: { type: String, default: "" },
    paymentStatus: { type: String, default: "Pending" },
    orderedAt: { type: Date, default: Date.now },

    // 🟢 ADD THESE
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: Number,
      },
    ],
  },
],


// 🔥 DELIVERED ORDERS (SUCCESSFULLY PAID)
deliveredOrders: [
  {
    orderId: { type: String },
    paymentId: { type: String },
    paymentStatus: { type: String, default: "Paid" },
    orderedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: Date.now },

    // 🟢 ADD THESE
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: Number,
      },
    ],
  },
],

  },

  // 🔥 createdAt, updatedAt
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
