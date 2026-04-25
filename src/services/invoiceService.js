const nodemailer = require('nodemailer');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const Booking = require('../models/Booking');

// Main email sending function
const sendEmail = async (res, booking) => {
  try {
    const mailMethod = process.env.MAIL_METHOD || 'nodemailer'; // default to nodemailer
    console.log("current email method set to: ", mailMethod);
    
    if (mailMethod === 'emailjs') {
      return await sendEmailJsEmail(res, booking);
    } else {
      return await sendNodemailerEmail(res, booking);
    }
  } catch (error) {
    console.error("Error in sendEmail:", error.message);
    return res.status(500).json({
      success: false,
      message: 'Error occurred while sending email!'
    });
  }
};

// Nodemailer implementation
const sendNodemailerEmail = async (res, booking) => {
  try {
    const companyName = 'Elantershome Technologies India Private Limited';
    const companyAddress = 'PLOT NO-64, KATOL ROAD,GITTI KHADAN, NAGPUR-13,NAGPUR,MAHARASHTRA, 440013';
    const gstNumber = '27AAICE9946N1ZQ';
    const companyEmail = 'customercare@elanters.com';

    const formattedDate = moment(booking.scheduledDateTime.date).format('DD MMMM, YYYY');
    
    const logoPath = path.join(__dirname, '/elanter_logo.png');
    const logoBase64 = fs.readFileSync(logoPath).toString('base64');
    
    const convenienceFee = 30;
    const gst = convenienceFee * 0.18;
    const discount = booking.coupon && booking.coupon.discountAmount ? booking.coupon.discountAmount : 0;
    
    const materialsTotal = booking.materials ? booking.materials.reduce((total, item) => 
      total + (item.price * item.quantity), 0) : 0;
    const totalAmount = materialsTotal + convenienceFee + gst - discount;
    const orderIdDisplay = booking._id.toString().substring(0, 8).toUpperCase();

    const invoiceHTML = generateInvoiceHTML(
      companyName,
      companyAddress,
      gstNumber,
      companyEmail,
      logoBase64,
      booking,
      formattedDate,
      convenienceFee,
      gst,
      discount,
      materialsTotal,
      orderIdDisplay
    );

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({ // Changed from createTransporter to createTransport
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Send email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: booking.customer.email,
      subject: `${companyName} Invoice - Order ${orderIdDisplay}`,
      text: `Thank you for choosing ${companyName}. Your total amount is ${totalAmount.toFixed(2)}. Please find attached invoice for more details.`,
      html: invoiceHTML,
    });

    console.log("Invoice email sent via Nodemailer: " + info.messageId);
    
    // Update booking with invoice info
    const invoice = {
      id: info.messageId,
      url: nodemailer.getTestMessageUrl(info),
      generatedAt: new Date(),
      sentToCustomer: true
    };

    await Booking.findByIdAndUpdate(
      { _id: booking._id },
      { 'payment.invoice': invoice },
      { new: true }
    );

    return info;

  } catch (error) {
    console.error("Error sending invoice email via Nodemailer:", error.message);
    throw error;
  }
};

// EmailJS implementation (your existing code)
const sendEmailJsEmail = async (res, booking) => {
  try {
    const companyName = 'Elantershome Technologies India Private Limited';
    const companyAddress = 'PLOT NO-64, KATOL ROAD,GITTI KHADAN, NAGPUR-13,NAGPUR,MAHARASHTRA, 440013';
    const gstNumber = '27AAICE9946N1ZQ';
    const companyEmail = 'customercare@elanters.com';

    const formattedDate = moment(booking.scheduledDateTime.date).format('DD MMMM, YYYY');
    
    const logoPath = path.join(__dirname, '/elanter_logo.png');
    const logoBase64 = fs.readFileSync(logoPath).toString('base64');
    
    const convenienceFee = 30;
    const gst = convenienceFee * 0.18;
    const discount = booking.coupon && booking.coupon.discountAmount ? booking.coupon.discountAmount : 0;
    
    const materialsTotal = booking.materials ? booking.materials.reduce((total, item) => 
      total + (item.price * item.quantity), 0) : 0;
    const totalAmount = materialsTotal + convenienceFee + gst - discount;
    const orderIdDisplay = booking._id.toString().substring(0, 8).toUpperCase();

    const invoiceHTML = generateInvoiceHTML(
      companyName,
      companyAddress,
      gstNumber,
      companyEmail,
      logoBase64,
      booking,
      formattedDate,
      convenienceFee,
      gst,
      discount,
      materialsTotal,
      orderIdDisplay
    );

    const transporter = nodemailer.createTransport({ // Changed from createTransporter to createTransport
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      subject: `${companyName} Invoice - Order ${orderIdDisplay}`,
      to: booking.customer.email,
      text: `Thank you for choosing ${companyName}. Your total amount is ${totalAmount.toFixed(2)}. Please find attached invoice for more details.`, 
      html: invoiceHTML,
    });

    console.log("Invoice email sent: "+ info.messageId);
    
    const invoice = {
      id: 'emailjs_' + Date.now(),
      generatedAt: new Date(),
      sentToCustomer: true
    };

    await Booking.findByIdAndUpdate(
      { _id: booking._id },
      { 'payment.invoice': invoice },
      { new: true }
    );

    return info;

  } catch (error) {
    console.error("Error sending invoice email:", error.message);
    return res.status(500).json({
      success:false,
      message:'Error occured while sending invoice mail!'
    })
  }
};

// Helper function to generate invoice HTML
const generateInvoiceHTML = (
  companyName,
  companyAddress,
  gstNumber,
  companyEmail,
  logoBase64,
  booking,
  formattedDate,
  convenienceFee,
  gst,
  discount,
  materialsTotal,
  orderIdDisplay
) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companyName} Invoice</title>
      <style>
        :root {
          --bg: #F8F5E9;
          --base: #9ec63c;
          --tint-1: #bbd777;
          --tint-3: #e2eec5;
          --shade-2: #3f4f18;
        }
        @page {
          margin: 0;
        }
        body {
          font-family: Arial, sans-serif;
          color: var(--shade-2);
          line-height: 1.5;
          margin: 0;
          padding: 0;
          background-color: var(--bg);
        }
        .page {
          page-break-after: always;
          position: relative;
          width: 100%;
          height: 100%;
          padding: 40px;
          box-sizing: border-box;
          background-color: var(--bg);
        }
        .header {
          border-bottom: 1px solid var(--tint-3);
          padding-bottom: 10px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
        }
        .logo {
          height: 40px;
          margin-right: 10px;
          filter: invert(1) sepia(1) hue-rotate(20deg) saturate(1000%) brightness(0.7);
        }
        .logo-text {
          color: var(--base);
          font-size: 24px;
          font-weight: bold;
          margin: 0;
          display: inline;
        }
        .customer-greeting {
          margin-top: 20px;
          margin-bottom: 20px;
        }
        .order-details-container {
          background-color: var(--tint-3);
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .order-details-title {
          font-size: 18px;
          font-weight: bold;
          margin-top: 0;
          margin-bottom: 15px;
          color: var(--shade-2);
        }
        .order-details-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #fff;
          margin-bottom: 20px;
        }
        .order-details-table th,
        .order-details-table td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid var(--tint-3);
        }
        .order-details-table th {
          background-color: var(--tint-1);
          color: var(--shade-2);
          font-weight: bold;
        }
        .order-details-table tr:last-child td {
          border-bottom: none;
        }
        .order-summary {
          margin-top: 20px;
          border-top: 1px solid var(--tint-3);
          padding-top: 10px;
        }
        .order-summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          color: var(--shade-2);
        }
        .highlighted-total {
          background-color: var(--tint-1);
          padding: 5px 15px;
          font-weight: bold;
          display: flex;
          justify-content: space-between;
          color: var(--shade-2);
        }
        .receipt-section {
          margin-top: 20px;
          font-weight: bold;
          color: var(--shade-2);
        }
        .note-section {
          margin-top: 5px;
          font-style: italic;
          color: var(--shade-2);
        }
        
        /* Second page styles */
        .customer-box {
          background-color: var(--tint-3);
          padding: 20px;
          margin-bottom: 20px;
          color: var(--shade-2);
        }
        .customer-title {
          font-weight: bold;
          margin-top: 0;
          margin-bottom: 10px;
          color: var(--shade-2);
        }
        .fees-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #fff;
          margin-bottom: 20px;
          color: var(--shade-2);
        }
        .fees-table th,
        .fees-table td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid var(--tint-3);
        }
        .fees-table th {
          background-color: var(--tint-1);
          color: var(--shade-2);
          font-weight: bold;
        }
        .footer-text {
          margin-top: 20px;
          text-align: center;
          color: var(--shade-2);
        }
        .signature {
          margin-top: 10px;
          text-align: right;
          color: var(--shade-2);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <img src="data:image/png;base64,${logoBase64}" alt="${companyName} Logo" class="logo">
        </div>
        
        <div class="customer-greeting">
          <p><strong>Dear ${booking.customer.name},</strong></p>
          <p>Thank you for choosing ${companyName}. We hope your experience was excellent. Below is the
          detailed breakdown of your payment. We look forward to serving you again.</p>
        </div>
        
        <div class="order-details-container">
          <h2 class="order-details-title">Order Details</h2>
          
          <table class="order-details-table">
            <tr>
              <td><strong>Order ID:</strong> ${orderIdDisplay}</td>
              <td style="text-align: right;"><strong>Date:</strong> ${formattedDate}</td>
            </tr>
          </table>
          
          <table class="order-details-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Price</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${booking.materials ? booking.materials.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>${item.price}</td>
                  <td style="text-align: right;">${item.price * item.quantity}</td>
                </tr>
              `).join('') : ''}
            </tbody>
          </table>
          
          <div class="order-summary">
            <div class="order-summary-row">
              <span>Total</span>
              <span>${materialsTotal}</span>
            </div>
            ${discount > 0 ? `
              <div class="order-summary-row">
                <span>Discount</span>
                <span>-${discount}</span>
              </div>
            ` : `
              <div class="order-summary-row">
                <span>Discount</span>
                <span>-0</span>
              </div>
            `}
            <div class="highlighted-total">
              <span>Total Amount</span>
              <span>${materialsTotal.toFixed(0)}</span>
            </div>
          </div>
        </div>
        
        <div class="receipt-section">
          <p>${companyName} Receipt</p>
        </div>
        <div class="note-section">
          <p>Note: Thank you for choosing us!</p>
        </div>
      </div>
      
      <div class="page">
        <div class="customer-box">
          <h3 class="customer-title">CUSTOMER DETAILS</h3>
          <p>${booking.customer.name}<br>
          ${booking.location.address}, ${booking.location.city}<br>
          ${booking.customer.email}</p>
        </div>
        
        <div class="customer-box">
          <h3 class="customer-title">BUSINESS DETAILS</h3>
          <p>${companyName}<br>
          ${companyAddress},<br>
          GSTN:${gstNumber}</p>
        </div>
        
        <table class="fees-table">
          <thead>
            <tr>
              <th>Items</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Convenience Fee</td>
              <td style="text-align: right;">${convenienceFee}</td>
            </tr>
            <tr>
              <td>GST @18%</td>
              <td style="text-align: right;">${gst.toFixed(1)}</td>
            </tr>
            <tr>
              <td style="font-weight: bold;">Total Amount</td>
              <td style="text-align: right; font-weight: bold;">${(convenienceFee + gst).toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
        
        <p>In case of any queries, our support team is ready to serve you with a resolution. Reach out to us at
        ${companyEmail}.</p>
        <p>Thank you once again for choosing ${companyName}. We look forward to being a part of your plant-care journey.</p>
        
        <div class="signature">
          <p>Best Regards,<br>Team ${companyName}</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const regenerateInvoice = (booking) => {
      const companyName = 'ELANTERS';
    const companyAddress = 'PLOT NO-64, KATOL ROAD,GITTI KHADAN, NAGPUR-13,NAGPUR,MAHARASHTRA, 440013';
    const gstNumber = '27EQLPS7347F2Z6';
    const companyEmail = 'customercare@elanters.com';

    const formattedDate = moment(booking.scheduledDateTime.date).format('DD MMMM, YYYY');
    
    const logoPath = path.join(__dirname, '/elanter_logo.png');
    const logoBase64 = fs.readFileSync(logoPath).toString('base64');
    
    const convenienceFee = 30;
    const gst = convenienceFee * 0.18;
    const discount = booking.coupon && booking.coupon.discountAmount ? booking.coupon.discountAmount : 0;
    
    const materialsTotal = booking.materials ? booking.materials.reduce((total, item) => 
      total + (item.price * item.quantity), 0) : 0;
    const totalAmount = materialsTotal + convenienceFee + gst - discount;
    const orderIdDisplay = booking._id.toString().substring(0, 8).toUpperCase();

    const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${companyName} Invoice</title>
      <style>
        :root {
          --bg: #F8F5E9;
          --base: #9ec63c;
          --tint-1: #bbd777;
          --tint-3: #e2eec5;
          --shade-2: #3f4f18;
        }
        @page {
          margin: 0;
        }
        body {
          font-family: Arial, sans-serif;
          color: var(--shade-2);
          line-height: 1.5;
          margin: 0;
          padding: 0;
          background-color: var(--bg);
        }
        .page {
          page-break-after: always;
          position: relative;
          width: 100%;
          height: 100%;
          padding: 40px;
          box-sizing: border-box;
          background-color: var(--bg);
        }
        .header {
          border-bottom: 1px solid var(--tint-3);
          padding-bottom: 10px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
        }
        .logo {
          height: 40px;
          margin-right: 10px;
          filter: invert(1) sepia(1) hue-rotate(20deg) saturate(1000%) brightness(0.7);
        }
        .logo-text {
          color: var(--base);
          font-size: 24px;
          font-weight: bold;
          margin: 0;
          display: inline;
        }
        .customer-greeting {
          margin-top: 20px;
          margin-bottom: 20px;
        }
        .order-details-container {
          background-color: var(--tint-3);
          padding: 20px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        .order-details-title {
          font-size: 18px;
          font-weight: bold;
          margin-top: 0;
          margin-bottom: 15px;
          color: var(--shade-2);
        }
        .order-details-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #fff;
          margin-bottom: 20px;
        }
        .order-details-table th,
        .order-details-table td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid var(--tint-3);
        }
        .order-details-table th {
          background-color: var(--tint-1);
          color: var(--shade-2);
          font-weight: bold;
        }
        .order-details-table tr:last-child td {
          border-bottom: none;
        }
        .order-summary {
          margin-top: 20px;
          border-top: 1px solid var(--tint-3);
          padding-top: 10px;
        }
        .order-summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          color: var(--shade-2);
        }
        .highlighted-total {
          background-color: var(--tint-1);
          padding: 5px 15px;
          font-weight: bold;
          display: flex;
          justify-content: space-between;
          color: var(--shade-2);
        }
        .receipt-section {
          margin-top: 20px;
          font-weight: bold;
          color: var(--shade-2);
        }
        .note-section {
          margin-top: 5px;
          font-style: italic;
          color: var(--shade-2);
        }
        
        /* Second page styles */
        .customer-box {
          background-color: var(--tint-3);
          padding: 20px;
          margin-bottom: 20px;
          color: var(--shade-2);
        }
        .customer-title {
          font-weight: bold;
          margin-top: 0;
          margin-bottom: 10px;
          color: var(--shade-2);
        }
        .fees-table {
          width: 100%;
          border-collapse: collapse;
          background-color: #fff;
          margin-bottom: 20px;
          color: var(--shade-2);
        }
        .fees-table th,
        .fees-table td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid var(--tint-3);
        }
        .fees-table th {
          background-color: var(--tint-1);
          color: var(--shade-2);
          font-weight: bold;
        }
        .footer-text {
          margin-top: 20px;
          text-align: center;
          color: var(--shade-2);
        }
        .signature {
          margin-top: 10px;
          text-align: right;
          color: var(--shade-2);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <img src="data:image/png;base64,${logoBase64}" alt="${companyName} Logo" class="logo">
        </div>
        
        <div class="customer-greeting">
          <p><strong>Dear ${booking.customer.name},</strong></p>
          <p>Thank you for choosing ${companyName}. We hope your experience was excellent. Below is the
          detailed breakdown of your payment. We look forward to serving you again.</p>
        </div>
        
        <div class="order-details-container">
          <h2 class="order-details-title">Order Details</h2>
          
          <table class="order-details-table">
            <tr>
              <td><strong>Order ID:</strong> ${orderIdDisplay}</td>
              <td style="text-align: right;"><strong>Date:</strong> ${formattedDate}</td>
            </tr>
          </table>
          
          <table class="order-details-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Price</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${booking.materials ? booking.materials.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>${item.price}</td>
                  <td style="text-align: right;">${item.price * item.quantity}</td>
                </tr>
              `).join('') : ''}
            </tbody>
          </table>
          
          <div class="order-summary">
            <div class="order-summary-row">
              <span>Total</span>
              <span>${materialsTotal}</span>
            </div>
            ${discount > 0 ? `
              <div class="order-summary-row">
                <span>Discount</span>
                <span>-${discount}</span>
              </div>
            ` : `
              <div class="order-summary-row">
                <span>Discount</span>
                <span>-0</span>
              </div>
            `}
            <div class="highlighted-total">
              <span>Total Amount</span>
              <span>${materialsTotal.toFixed(0)}</span>
            </div>
          </div>
        </div>
        
        <div class="receipt-section">
          <p>${companyName} Receipt</p>
        </div>
        <div class="note-section">
          <p>Note: Thank you for choosing us!</p>
        </div>
      </div>
      
      <div class="page">
        <div class="customer-box">
          <h3 class="customer-title">CUSTOMER DETAILS</h3>
          <p>${booking.customer.name}<br>
          ${booking.location.address}, ${booking.location.city}<br>
          ${booking.customer.email}</p>
        </div>
        
        <div class="customer-box">
          <h3 class="customer-title">BUISSNESS DETAILS</h3>
          <p>${companyName}<br>
          ${companyAddress},<br>
          GSTN:${gstNumber}</p>
        </div>
        
        <table class="fees-table">
          <thead>
            <tr>
              <th>Items</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Convenience Fee</td>
              <td style="text-align: right;">${convenienceFee}</td>
            </tr>
            <tr>
              <td>GST @18%</td>
              <td style="text-align: right;">${gst.toFixed(1)}</td>
            </tr>
            <tr>
              <td style="font-weight: bold;">Total Amount</td>
              <td style="text-align: right; font-weight: bold;">${(convenienceFee + gst).toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
        
        <p>In case of any queries, our support team is ready to serve you with a resolution. Reach out to us at
        ${companyEmail}.</p>
        <p>Thank you once again for choosing ${companyName}. We look forward to being a part of your plant-care journey.</p>
        
        <div class="signature">
          <p>Best Regards,<br>Team ${companyName}</p>
        </div>
      </div>
    </body>
    </html>
    `;

    return invoiceHTML;
}

module.exports = {sendEmail, regenerateInvoice};