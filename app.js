const express = require('express');
const app = express();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/mongo');
const User = require('./models/user');
const Otp = require('./models/otp');
const DeletedOrder = require("./models/deletedorder");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const Feedback = require('./models/feedback');
const Coupon = require('./models/coupan');
dotenv.config();
const crypto = require('crypto');

const productSchema = new mongoose.Schema({}, { strict: false });

const Product = mongoose.model("Product", productSchema, "products");



connectDB()

app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(cors({
  origin: 'https://meltedmeethas.com',  
  credentials: true                
}));

const JWT_SECRET =  process.env.JWT_SECRET;

app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  try {

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await newUser.save();


    const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, {
      expiresIn: '7d', 
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get("/featured", async (req, res) => {
  try {
    const featured = await Product.find({ featured: true });
    res.json(featured);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/hotdeals", async (req, res) => {
  try {
    const hotdeals = await Product.find({ hotDeals: true });
    res.json(hotdeals);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/view/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

app.get("/categories", async (req, res) => {
  try {
    const siteInfo = await mongoose.connection.db
      .collection("siteinfos") 
      .findOne({});

    if (!siteInfo || !siteInfo.categories) {
      return res.status(404).json({ error: "No categories found" });
    }

    res.json(["All", ...siteInfo.categories]);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user; 
    next();
  } catch (err) {
    res.status(401).json({ error: "Token is not valid" });
  }
};
app.post("/cart/add", authMiddleware, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const user = req.user;

    const quantityNum = parseInt(quantity) || 1;

 
    const existingItem = user.cart.find(
      (item) => item.product && item.product.toString() === productId.toString()
    );

    if (existingItem) {

      existingItem.quantity += quantityNum;
    } else {
   
      user.cart.push({ product: productId, quantity: quantityNum });
    }

    await user.save();
    res.json({ success: true, cart: user.cart });
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ error: "Failed to add to cart" });
  }
});


app.get("/cart", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("cart.product");
    const cart = user.cart
      .filter(item => item.product)
      .map(item => ({ quantity: item.quantity, product: item.product }));

    res.json(cart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

app.put("/cart/:productId", authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;
    const user = req.user;

    if (quantity < 1) {
      return res.status(400).json({ error: "Quantity must be at least 1" });
    }

    const item = user.cart.find(
      (item) => item.product && item.product.toString() === productId.toString()
    );

    if (!item) {
      return res.status(404).json({ error: "Product not found in cart" });
    }

    item.quantity = quantity;

    await user.save();


    const updatedUser = await User.findById(user._id).populate("cart.product");
    const updatedCart = updatedUser.cart
      .filter(item => item.product)
      .map(item => ({ quantity: item.quantity, product: item.product }));

    res.json(updatedCart);
  } catch (err) {
    console.error("Error updating cart:", err);
    res.status(500).json({ error: "Failed to update cart" });
  }
});



app.delete("/cart/:productId", authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const user = req.user;


    user.cart = user.cart.filter(
      (item) => item.product && item.product.toString() !== productId.toString()
    );

    await user.save();
    res.json({ success: true, message: "Item removed from cart" });
  } catch (err) {
    console.error("Error removing from cart:", err);
    res.status(500).json({ error: "Failed to remove from cart" });
  }
});




app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

  try {
    await Otp.findOneAndUpdate(
      { email },
      { otp, expiresAt },
      { upsert: true, new: true }
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"MM TEAM" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Melted Meethas Signup OTP",
      text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    });

    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email & OTP required" });

  try {
    const record = await Otp.findOne({ email, otp });
    if (!record) return res.status(400).json({ error: "Invalid OTP" });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: "OTP expired" });

    await Otp.deleteOne({ _id: record._id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get("/me", authMiddleware, async (req, res) => {
  try {
    const u = await User.findById(req.user._id) 
      .populate("cart.product", "title price discountPrice")
      .populate("pendingOrders.items.productId", "title price discountPrice")
      .populate("deliveredOrders.items.productId", "title price discountPrice");

    if (!u) return res.status(404).json({ message: "User not found" });

    const formatted = {
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      address: u.address,
      city: u.city,
      state: u.state,
      pincode: u.pincode,
      createdAt: u.createdAt,

   
      cart: u.cart.map((c) => ({
        id: c._id,
        name: c.product?.title || "Unknown",
        price: c.product?.discountPrice || c.product?.price || 0,
        qty: c.quantity,
      })),

      pendingOrders: u.pendingOrders.map((order) => ({
        orderId: order._id.toString(),
        date: new Date(order.orderedAt || order.createdAt || Date.now()).toLocaleDateString(),
        products: order.items.map((p) => ({
          name: p.productId?.title || "Unknown",
          price: p.productId?.discountPrice || p.productId?.price || 0,
          qty: p.quantity,
        })),
      })),

    
      previousOrders: u.deliveredOrders.map((order) => ({
        orderId: order._id.toString(),
        date: new Date(order.deliveredAt || order.createdAt || Date.now()).toLocaleDateString(),
        products: order.items.map((p) => ({
          name: p.productId?.title || "Unknown",
          price: p.productId?.discountPrice || p.productId?.price || 0,
          qty: p.quantity,
        })),
      })),
    };

    res.json(formatted);
    console.log("✅ User fetched successfully:", formatted);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ message: "Server error while fetching user" });
  }
});


app.post("/change-password", authMiddleware, async (req, res) => {
  const { current, new: newPass } = req.body;
  const user = await User.findById(req.user._id);
  const match = await bcrypt.compare(current, user.password);
  if (!match) return res.status(400).json({ error: "Incorrect current password" });
  user.password = await bcrypt.hash(newPass, 10);
  await user.save();
  res.json({ message: "Password updated" });
});


app.delete("/delete", async (req, res) => {
  await User.findByIdAndDelete(req.userId);
  res.json({ message: "User deleted" });
});


app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  await Otp.findOneAndUpdate({ email }, { otp, expiresAt }, { upsert: true });

  const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

  await transporter.sendMail({
    from: `"MM Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your OTP",
    text: `Your OTP for Password reset is ${otp} and will expire in 5 minutes`,
  });
app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: "Email and new password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

  
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();
    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
  res.json({ message: "OTP sent" });
});
app.get('/',function(req,res){
    res.send("working");

})


const razorpay = new Razorpay({
  key_id: process.env.key_id,
  key_secret: process.env.key_secret,
});

app.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body; // Already in paise from frontend

    const options = {
      amount: amount, // NO *100 because frontend sends *100
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id, // send only required field
    });
  } catch (error) {
    console.log("Order Error:", error);
    res.status(500).json({ success: false });
  }
});

// ---------------- Payment Verification + Add Pending Order -------------
app.post("/verify-payment", authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items,
      couponCode, // 👈 ADD THIS
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Missing payment fields" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSign = crypto
      .createHmac("sha256", process.env.key_secret)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Signature" });
    }

    const user = await User.findById(req.user._id);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    // ✅ OPTIONAL: Validate coupon again (extra security)
    let discountApplied = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isUsed: false });

      if (!coupon) {
        return res
          .status(400)
          .json({ success: false, message: "Coupon already used or invalid" });
      }

      discountApplied = coupon.discount || 200;

      // ❌ Mark coupon as used
      coupon.isUsed = true;
      await coupon.save();
    }

    const newOrder = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paymentStatus: "Paid",
      orderedAt: new Date(),
      discount: discountApplied, // 👈 save discount
      couponCode: couponCode || null,
      items: items.map((item) => ({
        productId: item.product._id,
        quantity: item.quantity,
      })),
    };

    user.pendingOrders.push(newOrder);
    user.cart = [];

    await user.save();

    res.json({
      success: true,
      message: "Order Saved Successfully!",
    });
  } catch (error) {
    console.log("Verify Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



app.delete("/clear-cart",authMiddleware,   async (req, res) => {
  const userId = req.user._id; 

  try {
    const user = await User.findById(userId);
    user.cart = [];
    await user.save();
    res.json({ message: "Cart cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to clear cart" });
  }
});

app.get("/orders", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("pendingOrders.items.productId", "title price discountPrice coverImage")
      .populate("deliveredOrders.items.productId", "title price discountPrice coverImage");

    if (!user) return res.status(404).json({ message: "User not found" });

    const allOrders = [
      ...user.pendingOrders.map(order => ({
        orderId: order._id || order.orderId,
        status: "Pending",
        date: order.orderedAt,
        couponCode: order.couponCode || null,   // ✅ ADD
        discount: order.discount || 0,          // ✅ ADD
        items: order.items.map(i => ({
          product: i.productId,
          quantity: i.quantity,
        })),
      })),

      ...user.deliveredOrders.map(order => ({
        orderId: order._id || order.orderId,
        status: "Delivered",
        date: order.deliveredAt,
        couponCode: order.couponCode || null,   // ✅ ADD
        discount: order.discount || 0,          // ✅ ADD
        items: order.items.map(i => ({
          product: i.productId,
          quantity: i.quantity,
        })),
      })),
    ];

    res.json(allOrders);
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});



app.get("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;

    const userData = await User.findOne({
      $or: [
        { "pendingOrders._id": orderId },
        { "deliveredOrders._id": orderId },
      ],
    })
      .populate({
        path: "pendingOrders.items.productId deliveredOrders.items.productId",
        model: "Product",
        select: "title price discountPrice coverImage",
      })
      .lean();

    if (!userData) {
      return res.status(404).json({ message: "Order not found" });
    }

    const found =
      userData.pendingOrders.find(o => o._id.toString() === orderId) ||
      userData.deliveredOrders.find(o => o._id.toString() === orderId);

    if (!found) {
      return res.status(404).json({ message: "Order not found" });
    }

    const isDelivered = userData.deliveredOrders.some(
      o => o._id.toString() === orderId
    );

    const formatted = {
      _id: found._id,
      items: found.items.map(i => ({
        productName: i.productId?.title,
        productPrice: i.productId?.price,
        productdiscountPrice: i.productId?.discountPrice,
        quantity: i.quantity,
        coverImage: i.productId?.coverImage,
      })),
      orderedAt: found.orderedAt,
      deliveredAt: found.deliveredAt,
      delivered: isDelivered,
      discount: found.discount || 0,        // ✅ ADD
      couponCode: found.couponCode || null, // ✅ ADD
    };

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.put("/update-address", authMiddleware, async (req, res) => {
  const { phone, address, city, state, pincode } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { phone, address, city, state, pincode },
    { new: true }
  );

  res.json({ message: "Address updated", user });
});

app.put("/update", authMiddleware, async (req, res) => {
  const { name} = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { name },
    { new: true }
  );

  res.json({ message: "Address updated", user });
});
app.post("/cancel/:orderId", authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { cancelReason } = req.body;

    if (!cancelReason)
      return res.status(400).json({ message: "Cancel reason is required" });

    // Get logged-in user
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("Cancel OrderId Received:", orderId);

    // Match order using _id
    const order = user.pendingOrders.find(
      (o) => o._id.toString() === orderId.toString()
    );

    console.log("Order matched:", order);

    if (!order)
      return res
        .status(404)
        .json({ message: "Order not found in pending orders" });

    // Fetch product details for snapshot
    const itemsWithDetails = await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.productId);
        return {
          productId: item.productId,
          quantity: item.quantity,
          productName: product?.productName || "",
          coverImage: product?.coverImage || "",
          productdiscountPrice: product?.discountPrice || 0,
        };
      })
    );

    // Save deleted order snapshot
    await DeletedOrder.create({
      originalOrderId: order._id,  // FIXED
      userId: user._id,

      userDetails: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        state: user.state,
        pincode: user.pincode,
      },

      items: itemsWithDetails,
      cancelReason,
    });

    // Remove from pendingOrders using correct key `_id`
    user.pendingOrders = user.pendingOrders.filter(
      (o) => o._id.toString() !== orderId.toString()
    );

    await user.save();

    res.json({ message: "Order cancelled successfully" });
  } catch (err) {
    console.error("Cancel Order Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});
app.post("/feedback", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message)
      return res.status(400).json({ message: "All fields required" });

    const fb = new Feedback({ name, email, message });
    await fb.save();

    res.status(201).json({ message: "Feedback submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
app.post("/apply-coupon", authMiddleware, async (req, res) => {
  const { code } = req.body;

  const coupon = await Coupon.findOne({ code, isUsed: false });

  if (!coupon) {
    return res.json({ success: false, message: "Invalid or used coupon" });
  }

  res.json({ success: true, discount: coupon.discount });
});




app.listen(3000)
