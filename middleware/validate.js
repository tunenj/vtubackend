// middleware/validate.js

const validateRequest = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      for (const rule of rules) {
        const error = rule(value, field, req.body);
        if (error) {
          errors.push({ field, message: error });
          break; // Stop at first error per field
        }
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    next();
  };
};

// ─── Reusable Rule Factories ───────────────────────────────────────────────────

const rules = {
  // Basic rules
  required: (value, field) =>
    value === undefined || value === null || String(value).trim() === ""
      ? `${field} is required`
      : null,

  string: (value, field) =>
    value !== undefined && typeof value !== "string"
      ? `${field} must be a string`
      : null,

  email: (value, field) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return !emailRegex.test(value) ? `${field} must be a valid email address` : null;
  },

  minLength: (min) => (value, field) =>
    value && String(value).trim().length < min
      ? `${field} must be at least ${min} characters`
      : null,

  maxLength: (max) => (value, field) =>
    value && String(value).trim().length > max
      ? `${field} must not exceed ${max} characters`
      : null,

  numeric: (value, field) =>
    value !== undefined && isNaN(Number(value))
      ? `${field} must be a number`
      : null,

  positiveNumber: (value, field) =>
    value !== undefined && Number(value) <= 0
      ? `${field} must be greater than zero`
      : null,

  minAmount: (min) => (value, field) =>
    value !== undefined && Number(value) < min
      ? `${field} must be at least ${min}`
      : null,

  phoneNumber: (value, field) => {
    if (!value) return null;
    const phoneRegex = /^(\+?234|0)[789][01]\d{8}$/;
    return !phoneRegex.test(String(value).trim())
      ? `${field} must be a valid Nigerian phone number`
      : null;
  },

  inArray: (allowedValues) => (value, field) =>
    value !== undefined && !allowedValues.includes(value)
      ? `${field} must be one of: ${allowedValues.join(", ")}`
      : null,

  meterNumber: (value, field) => {
    if (!value) return null;
    const meterRegex = /^\d{11,13}$/;
    return !meterRegex.test(String(value).trim())
      ? `${field} must be a valid meter number (11-13 digits)`
      : null;
  },

  smartCardNumber: (value, field) => {
    if (!value) return null;
    const cardRegex = /^\d{10,11}$/;
    return !cardRegex.test(String(value).trim())
      ? `${field} must be a valid smart card number (10-11 digits)`
      : null;
  },

  // ─── PASSWORD STRENGTH RULES ─────────────────────────────────────────────

  // Must contain at least one uppercase letter
  hasUppercase: (value, field) => {
    if (!value) return null;
    const uppercaseRegex = /[A-Z]/;
    return !uppercaseRegex.test(value)
      ? `${field} must contain at least one uppercase letter`
      : null;
  },

  // Must contain at least one lowercase letter
  hasLowercase: (value, field) => {
    if (!value) return null;
    const lowercaseRegex = /[a-z]/;
    return !lowercaseRegex.test(value)
      ? `${field} must contain at least one lowercase letter`
      : null;
  },

  // Must contain at least one number
  hasNumber: (value, field) => {
    if (!value) return null;
    const numberRegex = /\d/;
    return !numberRegex.test(value)
      ? `${field} must contain at least one number`
      : null;
  },

  // Must contain at least one special character
  hasSpecialChar: (value, field) => {
    if (!value) return null;
    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;
    return !specialCharRegex.test(value)
      ? `${field} must contain at least one special character (!@#$%^&* etc.)`
      : null;
  },

  // No spaces allowed
  noSpaces: (value, field) => {
    if (!value) return null;
    const spaceRegex = /\s/;
    return spaceRegex.test(value)
      ? `${field} cannot contain spaces`
      : null;
  },

  // No common passwords
  notCommonPassword: (value, field) => {
    if (!value) return null;
    const commonPasswords = [
      'password', 'password123', '123456', '12345678', 'qwerty', 
      'admin', 'admin123', 'letmein', 'welcome', 'monkey',
      'password1', '123456789', '12345', '1234', '1234567890',
      'abc123', 'computer', 'internet', 'test', 'test123',
      'qwerty123', '1q2w3e4r', '123123', '111111', '000000'
    ];
    return commonPasswords.includes(String(value).toLowerCase())
      ? `${field} is too common. Please choose a stronger password`
      : null;
  },

  // Password strength checker with comprehensive validation
  passwordStrength: (options = {}) => {
    const defaults = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
      noSpaces: true,
      noCommon: true
    };
    
    const config = { ...defaults, ...options };
    
    return (value, field ) => {
      if (!value) return null;
      
      const password = String(value);
      const errors = [];
      
      // Check length
      if (password.length < config.minLength) {
        errors.push(`at least ${config.minLength} characters`);
      }
      
      // Check uppercase
      if (config.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('an uppercase letter');
      }
      
      // Check lowercase
      if (config.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('a lowercase letter');
      }
      
      // Check number
      if (config.requireNumber && !/\d/.test(password)) {
        errors.push('a number');
      }
      
      // Check special character
      if (config.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('a special character');
      }
      
      // Check spaces
      if (config.noSpaces && /\s/.test(password)) {
        errors.push('no spaces');
      }
      
      // Check common passwords
      if (config.noCommon) {
        const commonPasswords = [
          'password', 'password123', '123456', '12345678', 'qwerty', 
          'admin', 'admin123', 'letmein', 'welcome', 'monkey'
        ];
        if (commonPasswords.includes(password.toLowerCase())) {
          return `${field} is too common. Please choose a stronger password`;
        }
      }
      
      // If there are errors, return a formatted message
      if (errors.length > 0) {
        return `${field} must contain ${errors.join(', ')}`;
      }
      
      return null;
    };
  },

  // Password confirmation (matches another field)
  matches: (fieldToMatch) => (value, field, allFields) => {
    if (!value || !allFields) return null;
    return value !== allFields[fieldToMatch]
      ? `${field} must match ${fieldToMatch}`
      : null;
  },

  // Not matching another field (for change password)
  notMatches: (fieldToMatch) => (value, field, allFields) => {
    if (!value || !allFields) return null;
    return value === allFields[fieldToMatch]
      ? `${field} must be different from ${fieldToMatch}`
      : null;
  },
};

// ─── Auth Validators ───────────────────────────────────────────────────────────

// Strong password registration with confirm password
const validateRegister = validateRequest({
  name: [
    rules.required,
    rules.string,
    rules.minLength(2),
    rules.maxLength(50),
  ],
  email: [
    rules.required,
    rules.email,
    rules.maxLength(100),
  ],
  password: [
    rules.required,
    rules.passwordStrength({
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
      noSpaces: true,
      noCommon: true
    }),
    rules.maxLength(64),
  ],
  confirmPassword: [
    rules.required,
    rules.matches('password'),
  ],
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
});

// Alternative: Registration with detailed individual rules
const validateRegisterDetailed = validateRequest({
  name: [
    rules.required,
    rules.string,
    rules.minLength(2),
    rules.maxLength(50),
  ],
  email: [
    rules.required,
    rules.email,
  ],
  password: [
    rules.required,
    rules.minLength(8),
    rules.maxLength(64),
    rules.hasUppercase,
    rules.hasLowercase,
    rules.hasNumber,
    rules.hasSpecialChar,
    rules.noSpaces,
    rules.notCommonPassword,
  ],
  confirmPassword: [
    rules.required,
    rules.matches('password'),
  ],
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
});

// Login validator (less strict for existing users)
const validateLogin = validateRequest({
  email: [
    rules.required,
    rules.email,
  ],
  password: [
    rules.required,
    rules.minLength(6),
    rules.maxLength(64),
  ],
});

// Refresh token validator
const validateRefresh = validateRequest({
  refreshToken: [
    rules.required,
  ],
});

// Change password validator
const validateChangePassword = validateRequest({
  currentPassword: [
    rules.required,
    rules.minLength(6),
    rules.maxLength(64),
  ],
  newPassword: [
    rules.required,
    rules.passwordStrength({
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
      noSpaces: true,
      noCommon: true
    }),
    rules.maxLength(64),
    rules.notMatches('currentPassword'),
  ],
  confirmNewPassword: [
    rules.required,
    rules.matches('newPassword'),
  ],
});

// Forgot password request validator
const validateForgotPassword = validateRequest({
  email: [
    rules.required,
    rules.email,
  ],
});

// Reset password validator
const validateResetPassword = validateRequest({
  token: [
    rules.required,
  ],
  newPassword: [
    rules.required,
    rules.passwordStrength({
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
      noSpaces: true,
      noCommon: true
    }),
    rules.maxLength(64),
  ],
  confirmNewPassword: [
    rules.required,
    rules.matches('newPassword'),
  ],
});

// ─── Wallet Validators ─────────────────────────────────────────────────────────

const validateFundWallet = validateRequest({
  amount: [
    rules.required,
    rules.numeric,
    rules.positiveNumber,
    rules.minAmount(100),
  ],
});

const validateTransfer = validateRequest({
  recipientEmail: [
    rules.required,
    rules.email,
  ],
  amount: [
    rules.required,
    rules.numeric,
    rules.positiveNumber,
    rules.minAmount(100),
  ],
  description: [
    rules.string,
    rules.maxLength(200),
  ],
});

const validateWithdraw = validateRequest({
  amount: [
    rules.required,
    rules.numeric,
    rules.positiveNumber,
    rules.minAmount(500),
  ],
  bankCode: [
    rules.required,
    rules.string,
    rules.minLength(3),
  ],
  accountNumber: [
    rules.required,
    rules.string,
    rules.minLength(10),
    rules.maxLength(10),
  ],
  accountName: [
    rules.required,
    rules.string,
    rules.minLength(3),
  ],
  pin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
});

// ─── VTU Validators ────────────────────────────────────────────────────────────

const validateBuyAirtime = validateRequest({
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
  amount: [
    rules.required,
    rules.numeric,
    rules.positiveNumber,
    rules.minAmount(50),
    (value) => Number(value) <= 10000 ? null : 'amount must not exceed ₦10,000',
  ],
  network: [
    rules.required,
    rules.inArray(["MTN", "GLO", "AIRTEL", "9MOBILE"]),
  ],
  pin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
});

const validateBuyData = validateRequest({
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
  network: [
    rules.required,
    rules.inArray(["MTN", "GLO", "AIRTEL", "9MOBILE"]),
  ],
  planId: [
    rules.required,
    rules.string,
    rules.minLength(3),
  ],
  pin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
});

const validateBuyElectricity = validateRequest({
  meterNumber: [
    rules.required,
    rules.meterNumber,
  ],
  amount: [
    rules.required,
    rules.numeric,
    rules.positiveNumber,
    rules.minAmount(500),
  ],
  meterType: [
    rules.required,
    rules.inArray(["prepaid", "postpaid"]),
  ],
  provider: [
    rules.required,
    rules.inArray(["IKEDC", "EKEDC", "PHED", "IBEDC", "AEDC", "KEDCO", "YEDC", "BEDC", "ENEDCO", "EEDC"]),
  ],
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
  pin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
});

const validateBuyCableTv = validateRequest({
  smartCardNumber: [
    rules.required,
    rules.smartCardNumber,
  ],
  provider: [
    rules.required,
    rules.inArray(["DSTV", "GOTV", "STARTIMES"]),
  ],
  planId: [
    rules.required,
    rules.string,
  ],
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
  pin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
});

const validateVerifyMeter = validateRequest({
  meterNumber: [
    rules.required,
    rules.meterNumber,
  ],
  meterType: [
    rules.required,
    rules.inArray(["prepaid", "postpaid"]),
  ],
  provider: [
    rules.required,
    rules.string,
  ],
});

const validateVerifySmartCard = validateRequest({
  smartCardNumber: [
    rules.required,
    rules.smartCardNumber,
  ],
  provider: [
    rules.required,
    rules.inArray(["DSTV", "GOTV", "STARTIMES"]),
  ],
});

const validateBeneficiary = validateRequest({
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
  network: [
    rules.required,
    rules.inArray(["MTN", "GLO", "AIRTEL", "9MOBILE"]),
  ],
  nickname: [
    rules.string,
    rules.minLength(2),
    rules.maxLength(30),
  ],
  type: [
    rules.required,
    rules.inArray(["airtime", "data"]),
  ],
});

const validateUpdatePin = validateRequest({
  currentPin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
  newPin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
    rules.notMatches('currentPin'),
  ],
  confirmNewPin: [
    rules.required,
    rules.matches('newPin'),
  ],
});

const validateVerifyPin = validateRequest({
  pin: [
    rules.required,
    rules.string,
    rules.minLength(4),
    rules.maxLength(4),
  ],
});

// ─── Admin Validators ──────────────────────────────────────────────────────────

const validateAdminCreateUser = validateRequest({
  name: [
    rules.required,
    rules.string,
    rules.minLength(2),
    rules.maxLength(50),
  ],
  email: [
    rules.required,
    rules.email,
  ],
  phone: [
    rules.required,
    rules.phoneNumber,
  ],
  password: [
    rules.required,
    rules.minLength(8),
  ],
  role: [
    rules.inArray(['user', 'admin', 'reseller']),
  ],
});

const validateAdminUpdateUser = validateRequest({
  name: [
    rules.string,
    rules.minLength(2),
    rules.maxLength(50),
  ],
  email: [
    rules.email,
  ],
  phone: [
    rules.phoneNumber,
  ],
  role: [
    rules.inArray(['user', 'admin', 'reseller']),
  ],
  isVerified: [
    rules.inArray(['true', 'false', true, false]),
  ],
});

// ─── Exports ───────────────────────────────────────────────────────────────────

export {
  validateRequest,
  rules,
  // Auth validators
  validateRegister,
  validateRegisterDetailed,
  validateLogin,
  validateRefresh,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  // Wallet validators
  validateFundWallet,
  validateTransfer,
  validateWithdraw,
  // VTU validators
  validateBuyAirtime,
  validateBuyData,
  validateBuyElectricity,
  validateBuyCableTv,
  validateVerifyMeter,
  validateVerifySmartCard,
  validateBeneficiary,
  validateUpdatePin,
  validateVerifyPin,
  // Admin validators
  validateAdminCreateUser,
  validateAdminUpdateUser,
};