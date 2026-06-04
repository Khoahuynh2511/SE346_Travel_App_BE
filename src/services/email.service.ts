import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465, // true for 465, false for other ports
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass,
  },
  tls: {
    rejectUnauthorized: false, // Fix "self-signed certificate" error
  },
});

const commonStyles = `
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f7f9; color: #333; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
  .header { background: #007AFF; padding: 40px 20px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  .content { padding: 40px; line-height: 1.6; }
  .content p { margin-bottom: 20px; font-size: 16px; color: #555; }
  .button { display: inline-block; padding: 14px 32px; background-color: #007AFF; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; transition: background-color 0.2s; }
  .otp-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center; margin: 30px 0; }
  .otp-code { font-size: 36px; font-weight: 800; color: #1a202c; letter-spacing: 8px; margin: 0; }
  .footer { padding: 30px 40px; background: #f8fafc; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  .footer a { color: #007AFF; text-decoration: none; }
`;

export const emailService = {
  async sendVerificationEmail(email: string, token: string) {
    const verifyUrl = `${env.appUrl}/api/v1/auth/verify-email?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${commonStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Confirm Your Email</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Welcome to <strong>Travel App</strong>! We're excited to have you join our community. To get started, please confirm your email address by clicking the button below.</p>
            <div style="text-align: center; margin: 35px 0;">
              <a href="${verifyUrl}" class="button">Verify My Account</a>
            </div>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; font-size: 14px; color: #007AFF;">${verifyUrl}</p>
            <p>This link will expire in 24 hours.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Travel App. All rights reserved.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await transporter.sendMail({
        from: env.emailFrom,
        to: email,
        subject: "Verify your email - Travel App",
        html,
      });
      logger.info(`Verification email sent to ${email}`);
    } catch (error: any) {
      logger.error(`Error sending verification email to ${email}: ${error.message}`);
      throw new Error("EMAIL_SEND_FAILED");
    }
  },

  async sendOtpEmail(email: string, otp: string) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${commonStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Security Verification</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You've requested a code to change your password. Use the following one-time password (OTP) to complete the process:</p>
            <div class="otp-card">
              <p class="otp-code">${otp}</p>
            </div>
            <p>This code is valid for <strong>10 minutes</strong>. For your security, please do not share this code with anyone.</p>
            <p>If you didn't request a password change, please ignore this email or contact support if you're concerned about your account security.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Travel App. All rights reserved.</p>
            <p><a href="#">Contact Support</a> | <a href="#">Privacy Policy</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await transporter.sendMail({
        from: env.emailFrom,
        to: email,
        subject: "Your Password Reset OTP - Travel App",
        html,
      });
      logger.info(`OTP email sent to ${email}`);
    } catch (error: any) {
      logger.error(`Error sending OTP email to ${email}: ${error.message}`);
      throw new Error("EMAIL_SEND_FAILED");
    }
  }
};
