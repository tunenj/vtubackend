// controllers/authController.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import crypto from 'crypto';
import { sendPasswordResetEmail, sendPasswordResetEmailDev } from '../services/emailService.js';

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '10m'  // 10 minutes
  });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'   // 7 days
  });
  return { accessToken, refreshToken };
};

// Generate random token for password reset
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

export const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const exists = await User.findOne({ $or: [{ email }, { phone }] });
    if (exists) return res.status(400).json({ message: 'User already exists' });

    const user = await User.create({ name, email, phone, password });
    await Wallet.create({ user: user._id });

    const { accessToken, refreshToken } = generateTokens(user._id);
    res.status(201).json({ 
      accessToken, 
      refreshToken, 
      user: { id: user._id, name, email, phone } 
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    // Update last login info
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip || req.connection.remoteAddress;
    user.lastLoginUserAgent = req.headers['user-agent'];
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);
    res.json({ 
      accessToken, 
      refreshToken, 
      user: { id: user._id, name: user.name, email, phone: user.phone } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

    const { accessToken } = generateTokens(user._id);
    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh token error:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

// controllers/authController.js
export const logout = async (req, res) => {
  try {
    // If user is authenticated (from protect middleware)
    if (req.user) {
      console.log(`User ${req.user.id} logged out`);
      
      // Optional: You could blacklist the refresh token here
      const { refreshToken } = req.body;
      if (refreshToken) {
        // Add to blacklist or remove from database
        // await TokenBlacklist.create({ token: refreshToken });
      }
    }

    // Always return success - client should clear tokens
    res.json({ 
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Logout failed' 
    });
  }
};

// ─── NEW PASSWORD MANAGEMENT FUNCTIONS ─────────────────────────────────────────

/**
 * @desc    Change password (authenticated user)
 * @route   POST /api/auth/change-password
 * @access  Private
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // Assuming auth middleware sets req.user

    // Get user with password field
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Generate new tokens (optional - force re-login or keep logged in)
    const { accessToken, refreshToken } = generateTokens(user._id);

    res.json({ 
      success: true,
      message: 'Password changed successfully',
      accessToken,  // Send new tokens so user doesn't have to login again
      refreshToken
    });
    
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Forgot password - send reset token to email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    
    // Don't reveal if user exists or not (security)
    if (!user) {
      return res.json({ 
        success: true,
        message: 'If your email is registered, you will receive a password reset link' 
      });
    }

    // Generate reset token
    const resetToken = generateRandomToken();
    
    // Set token and expiry (1 hour)
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 3600000; // 1 hour
    
    await user.save();

    // Send email based on environment
    if (process.env.NODE_ENV === 'production') {
      // In production, actually send the email
      await sendPasswordResetEmail(email, resetToken);
      console.log(`✅ Password reset email sent to ${email}`);
    } else {
      // In development, just log the token
      await sendPasswordResetEmailDev(email, resetToken);
    }

    // Always return the same message (don't reveal if email was sent)
    res.json({ 
      success: true,
      message: 'If your email is registered, you will receive a password reset link' 
    });
    
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() } // Token not expired
    });

    if (!user) {
      return res.status(400).json({ 
        message: 'Password reset token is invalid or has expired' 
      });
    }

    // Update password
    user.password = newPassword;
    
    // Clear reset token fields
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    await user.save();

    // Generate new tokens for automatic login
    const { accessToken, refreshToken } = generateTokens(user._id);

    res.json({ 
      success: true,
      message: 'Password has been reset successfully',
      accessToken,
      refreshToken,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone 
      }
    });
    
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Verify password reset token
 * @route   POST /api/auth/verify-reset-token
 * @access  Public
 */
export const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Token is invalid or has expired' 
      });
    }

    res.json({ 
      success: true,
      message: 'Token is valid' 
    });
    
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ message: err.message });
  }
};