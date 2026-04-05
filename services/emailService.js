const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "orders@sporttechies.com"; // Use Resend's test domain for development

// Send vendor notification email
const sendVendorOrderNotification = async (vendor) => {
  try {
    console.log("[v0] Sending vendor notification to:", vendor.email);

    const itemsHTML = vendor.items
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${item.productName}</td>
        <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">KES ${item.totalPrice.toLocaleString()}</td>
      </tr>
    `,
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Order Received</h2>
        <p>Hi ${vendor.vendorName},</p>
        <p>A customer has placed an order containing your products:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Product</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Qty</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #28a745;">
          <p><strong>Order Details:</strong></p>
          <p>Order Number: <strong>#${vendor.orderNumber}</strong></p>
          <p>Customer: <strong>${vendor.customerName}</strong></p>
          <p>Shipping Address: <strong>${vendor.shippingAddress}</strong></p>
          <p>Phone: <strong>${vendor.shippingPhone}</strong></p>
        </div>

        <p style="margin-top: 20px; color: #666;">Please prepare the items for shipment and update the order status.</p>
        <p>Thank you for using ItenGear!</p>
      </div>
    `;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: vendor.email,
      subject: `New Order #${vendor.orderNumber} - Products Ordered`,
      html: html,
    });

    console.log("[v0] Vendor notification sent successfully:", result);
  } catch (err) {
    console.error("[v0] Failed to send vendor notification:", err.message);
  }
};

// Send admin notification email
const sendAdminOrderNotification = async (adminEmail, order) => {
  try {
    console.log("[v0] Sending admin notification to:", adminEmail);

    const itemsHTML = order.items
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${item.productName}</td>
        <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.vendorName || "N/A"}</td>
      </tr>
    `,
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Order Placed</h2>
        
        <div style="background-color: #e8f4f8; padding: 15px; border-left: 4px solid #0066cc; margin: 15px 0;">
          <p><strong>Order #${order.orderNumber}</strong></p>
          <p>Total Amount: <strong>KES ${order.total.toLocaleString()}</strong></p>
          <p>Payment Status: <strong>${order.paymentStatus}</strong></p>
        </div>

        <h3 style="color: #333; margin-top: 20px;">Order Items (${order.items.length} items):</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Product</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Qty</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Vendor</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div style="background-color: #f9f9f9; padding: 15px; margin-top: 20px; border: 1px solid #ddd;">
          <p><strong>Customer Information:</strong></p>
          <p>Name: ${order.customerName}</p>
          <p>Email: ${order.customerEmail}</p>
          <p>Phone: ${order.shippingPhone}</p>
          <p>Address: ${order.shippingAddress}</p>
        </div>

        <p style="margin-top: 20px; color: #666;">Please review this order and take necessary action.</p>
      </div>
    `;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `New Order #${order.orderNumber} - Admin Alert`,
      html: html,
    });

    console.log("[v0] Admin notification sent successfully:", result);
  } catch (err) {
    console.error("[v0] Failed to send admin notification:", err.message);
  }
};

// Send customer order confirmation email
const sendCustomerOrderConfirmation = async (customer) => {
  try {
    console.log("[v0] Sending customer confirmation to:", customer.email);

    const itemsHTML = customer.items
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${item.productName}</td>
        <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${item.quantity}</td>
        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">KES ${item.totalPrice.toLocaleString()}</td>
      </tr>
    `,
      )
      .join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 20px; background-color: #28a745; color: white;">
          <h1 style="margin: 0;">Order Confirmed!</h1>
        </div>

        <div style="padding: 20px;">
          <p>Hi ${customer.customerName},</p>
          <p>Thank you for your order! We've received your purchase and are processing it right away.</p>

          <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">
            <p><strong>Order Number:</strong> #${customer.orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleDateString("en-KE")}</p>
            <p><strong>Total Amount:</strong> KES ${customer.total.toLocaleString()}</p>
            <p><strong>Payment Method:</strong> ${customer.paymentMethod}</p>
          </div>

          <h3 style="color: #333;">Order Items:</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Product</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Qty</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>

          <div style="background-color: #f0f0f0; padding: 15px; margin-top: 20px; text-align: right; font-size: 18px;">
            <p><strong>Total: KES ${customer.total.toLocaleString()}</strong></p>
          </div>

          <div style="background-color: #e8f4f8; padding: 15px; margin-top: 20px; border-left: 4px solid #0066cc;">
            <h4 style="margin-top: 0;">Delivery Information</h4>
            <p>Delivery Address: ${customer.shippingAddress}</p>
            <p>Contact Number: ${customer.shippingPhone}</p>
            <p>Estimated Delivery: Within 3-5 business days</p>
          </div>

          <p style="margin-top: 20px; color: #666; font-size: 12px;">
            You will receive updates about your order via email. If you have any questions, please contact us.
          </p>
          <p style="color: #28a745; font-weight: bold;">Thank you for shopping with ItenGear!</p>
        </div>
      </div>
    `;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: customer.email,
      subject: `Order Confirmation #${customer.orderNumber} - ItenGear`,
      html: html,
    });

    console.log("[v0] Customer confirmation sent successfully:", result);
  } catch (err) {
    console.error("[v0] Failed to send customer confirmation:", err.message);
  }
};

module.exports = {
  sendVendorOrderNotification,
  sendAdminOrderNotification,
  sendCustomerOrderConfirmation,
};
