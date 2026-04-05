const express = require("express");
const { authenticate } = require("../middleware/auth");
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notificationController");

const router = express.Router();

// Get all notifications for user
router.get("/", authenticate, getNotifications);

// Get unread notification count
router.get("/unread-count", authenticate, getUnreadCount);

// Mark notification as read
router.put("/:notificationId/read", authenticate, markAsRead);

// Mark all as read
router.put("/read-all", authenticate, markAllAsRead);

module.exports = router;
