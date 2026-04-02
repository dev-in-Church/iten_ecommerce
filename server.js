require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cron = require("node-cron");

const { testConnection } = require("./config/database");
const { checkExpiredSubscriptions } = require("./jobs/subscriptionExpiry");

// Import routes
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const cartRoutes = require("./routes/cart");
const orderRoutes = require("./routes/orders");
const mpesaRoutes = require("./routes/mpesa");
const paymentRoutes = require("./routes/payments");
const vendorRoutes = require("./routes/vendor");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5000;

// CORS config for multiple subdomains
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  process.env.VENDOR_URL || "http://vendor.localhost:3000",
  process.env.ADMIN_URL || "http://admin.localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "https://iten-marketplace.vercel.app",
  "https://iten-marketplace-vendor.vercel.app",
  "https://iten-marketplace-admin.vercel.app",
  "https://runnermkt.sporttechies.com",
  "https://runnermkt.sporttechies.com",
  "https://vendorcenter.sporttechies.com",
  "https://admin.runnermkt.sporttechies.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.some((allowed) =>
          origin.startsWith(allowed.replace(/\/$/, "")),
        )
      ) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all in dev
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "ItenGear API",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/admin", adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// Cron job: check expired subscriptions every hour
cron.schedule("0 * * * *", () => {
  console.log("Running subscription expiry check...");
  checkExpiredSubscriptions();
});

// Start server
const startServer = async () => {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn(
      "WARNING: Database not connected. Running with mock data fallback.",
    );
  }
  app.listen(PORT, () => {
    console.log(`ItenGear API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
};

startServer();

module.exports = app;
