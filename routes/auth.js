// routes/auth.js
import express from 'express';
import { 
  register, 
  login, 
  refresh, 
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyResetToken
} from '../controllers/authController.js';
import {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
} from '../middleware/validate.js';
import protect from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/refresh', validateRefresh, refresh);
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password', validateResetPassword, resetPassword);
router.post('/verify-reset-token', verifyResetToken);

// Protected routes (require authentication)
router.post('/logout', logout);
router.post('/change-password', protect, validateChangePassword, changePassword);

// Test protected route
router.get('/profile', protect, (req, res) => {
  res.json({ 
    message: 'Protected route accessed',
    user: req.user 
  });
});

export default router;