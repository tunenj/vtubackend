import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name:       { type: String,  required: true, trim: true },
  email:      { type: String,  required: true, unique: true, lowercase: true },
  phone:      { type: String,  required: true, unique: true },
  password:   { type: String,  required: true },
  pin:        { type: String },           // 4-digit transaction PIN (hashed)
  role:       { type: String,  enum: ['user', 'admin', 'reseller'], default: 'user' },
  isVerified: { type: Boolean, default: true },
  beneficiaries: [
    {
      phone:    { type: String },
      network:  { type: String },
      nickname: { type: String },
      type:     { type: String },
    }
  ],
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model('User', UserSchema);