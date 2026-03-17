import mongoose from 'mongoose';

const DataPlanSchema = new mongoose.Schema({
  network:  { type: String,  required: true },
  planId:   { type: String,  required: true },   // VTpass plan code
  name:     { type: String,  required: true },   // e.g. "1GB - 30 days"
  price:    { type: Number,  required: true },   // in NGN
  validity: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('DataPlan', DataPlanSchema);