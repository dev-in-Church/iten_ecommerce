const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  getDashboard,
  getVendorProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getVendorOrders,
  updateOrderItemStatus,
  getEarnings,
  updateVendorProfile,
  requestVerification,
} = require("../controllers/vendorController");

// Dashboard
router.get("/dashboard", authenticate, authorize("vendor"), getDashboard);

// Products - vendors can add products freely (no subscription required)
router.get("/products", authenticate, authorize("vendor"), getVendorProducts);
router.post("/products", authenticate, authorize("vendor"), createProduct);
router.put("/products/:id", authenticate, authorize("vendor"), updateProduct);
router.delete(
  "/products/:id",
  authenticate,
  authorize("vendor"),
  deleteProduct,
);

// Orders
router.get("/orders", authenticate, authorize("vendor"), getVendorOrders);
router.put(
  "/orders/:id/status",
  authenticate,
  authorize("vendor"),
  updateOrderItemStatus,
);

// Earnings (commission-based model)
router.get("/earnings", authenticate, authorize("vendor"), getEarnings);

// Profile & Verification
router.put("/profile", authenticate, authorize("vendor"), updateVendorProfile);
router.post(
  "/request-verification",
  authenticate,
  authorize("vendor"),
  requestVerification,
);

module.exports = router;
