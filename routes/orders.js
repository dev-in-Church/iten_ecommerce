const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createOrder,
  getMyOrders,
  getOrder,
  getOrderForPayment,
  cancelOrder,
} = require("../controllers/orderController");

router.post("/", authenticate, authorize("customer"), createOrder);
router.get("/", authenticate, authorize("customer"), getMyOrders);
router.get("/:id", authenticate, authorize("customer"), getOrder);
router.get(
  "/:id/payment",
  authenticate,
  authorize("customer"),
  getOrderForPayment,
);
router.put("/:id/cancel", authenticate, authorize("customer"), cancelOrder);

module.exports = router;
