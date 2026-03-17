import mongoose from 'mongoose';
import { TX_STATUS, TX_TYPES } from '../config/constants.js';

const TransactionSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, enum: Object.values(TX_TYPES),   required: true },
  amount:      { type: Number, required: true },
  phone:       { type: String },          // recipient phone
  network:     { type: String },          // mtn, airtel, glo, 9mobile
  dataplan:    { type: String },          // e.g. "1GB - 30 days"
  reference:   { type: String, unique: true },
  status:      { type: String, enum: Object.values(TX_STATUS), default: TX_STATUS.PENDING },
  providerRef: { type: String },          // third-party API reference
  meta:        { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

export default mongoose.model('Transaction', TransactionSchema);