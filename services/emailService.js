// services/emailService.js
import nodemailer from 'nodemailer';

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS  // Your Gmail app password
  }
});

// For production with other services (SendGrid, etc.)
// const transporter = nodemailer.createTransport({
//   host: 'smtp.sendgrid.net',
//   port: 587,
//   auth: {
//     user: 'apikey',
//     pass: process.env.SENDGRID_API_KEY
//   }
// });

export const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: `"VTU App" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6F0C15;">Password Reset Request</h2>
        <p>You requested a password reset for your VTU App account.</p>
        <p>Click the button below to reset your password. This link is valid for 1 hour.</p>
        <a href="${resetUrl}" 
           style="display: inline-block; background-color: #6F0C15; color: white; 
                  padding: 12px 24px; text-decoration: none; border-radius: 5px; 
                  margin: 20px 0;">
          Reset Password
        </a>
        <p>Or copy this link:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">VTU App - Your Virtual Top-Up Service</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// For development - logs to console instead of sending
export const sendPasswordResetEmailDev = async (email, resetToken) => {
  console.log('=================================');
  console.log('📧 PASSWORD RESET EMAIL (DEV MODE)');
  console.log('To:', email);
  console.log('Token:', resetToken);
  console.log('Reset Link:', `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`);
  console.log('=================================');
};