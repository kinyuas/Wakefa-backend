// utils/emailService.js
const nodemailer = require('nodemailer');
const { SYSTEM_EMAIL, SYSTEM_EMAIL_PASSWORD } = require('../config/constants');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SYSTEM_EMAIL, pass: SYSTEM_EMAIL_PASSWORD },
    tls: { rejectUnauthorized: false }
  });
  return transporter;
};

const sendSecureCodeEmail = async (to, code) => {
  try {
    const info = await getTransporter().sendMail({
      from: { name: 'Stanzo Shop Management', address: SYSTEM_EMAIL },
      to,
      subject: 'Your Secure Login Code - Stanzo Shop Management',
      text: `Your secure login code is: ${code}\n\nExpires in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Stanzo Shop Management</h2>
          <p>Your secure login code is:</p>
          <p style="font-size: 32px; font-weight: bold; color: #2c5282;">${code}</p>
          <p>This code will expire in 15 minutes.</p>
        </div>`
    });
    console.log('✅ Email sent:', info.messageId);
    return true;
  } catch (err) {
    console.error('❌ Email error:', err.message);
    console.log(`📧 [DEV] Code for ${to}: ${code}`);
    return false;
  }
};

module.exports = { sendSecureCodeEmail };