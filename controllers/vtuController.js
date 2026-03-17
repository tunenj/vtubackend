import mongoose from 'mongoose';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import DataPlan from '../models/DataPlan.js';
import * as vtpass from '../services/vtpassService.js';
import { TX_STATUS, TX_TYPES, NETWORKS } from '../config/constants.js';

// ─── NETWORKS ────────────────────────────────────────────────────────────────

/**
 * @desc    Get all supported networks
 * @route   GET /api/vtu/networks
 * @access  Public
 */
export const getNetworks = async (req, res) => {
  try {
    res.json(Object.values(NETWORKS));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── DATA PLANS ──────────────────────────────────────────────────────────────

/**
 * @desc    Get active data plans for a specific network
 * @route   GET /api/vtu/plans/:network
 * @access  Public
 */
export const getDataPlans = async (req, res) => {
  try {
    const plans = await DataPlan.find({ network: req.params.network, isActive: true });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Sync data plans from VTpass API into local database
 * @route   POST /api/vtu/plans/sync
 * @access  Admin only
 */
export const syncDataPlans = async (req, res) => {
  try {
    const networks = ['mtn', 'airtel', 'glo', 'etisalat'];
    for (const network of networks) {
      const result = await vtpass.getDataPlans(network);
      const plans  = result?.content?.varations || [];

      for (const plan of plans) {
        await DataPlan.findOneAndUpdate(
          { planId: plan.variation_code, network },
          {
            planId:   plan.variation_code,
            name:     plan.name,
            price:    plan.variation_amount,
            network,
            isActive: true,
          },
          { upsert: true, new: true }
        );
      }
    }
    res.json({ message: 'Data plans synced successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── AIRTIME ─────────────────────────────────────────────────────────────────

/**
 * @desc    Purchase airtime for any Nigerian network
 * @route   POST /api/vtu/airtime
 * @access  Private
 * @body    { phone, network, amount }
 */
export const buyAirtime = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { phone, network, amount } = req.body;
    const userId = req.user._id;

    const wallet = await Wallet.findOne({ user: userId }).session(session);
    if (!wallet || wallet.balance < amount)
      return res.status(400).json({ message: 'Insufficient balance' });

    wallet.balance -= amount;
    await wallet.save({ session });

    const tx = await Transaction.create([{
      user: userId, type: TX_TYPES.AIRTIME,
      amount, phone, network, status: TX_STATUS.PENDING,
      reference: `AIR-${Date.now()}`,
    }], { session });

    await session.commitTransaction();

    try {
      const result    = await vtpass.buyAirtime({ network, phone, amount });
      const isSuccess = result.data?.code === '000';

      tx[0].status      = isSuccess ? TX_STATUS.SUCCESS : TX_STATUS.FAILED;
      tx[0].providerRef = result.ref;
      await tx[0].save();

      if (!isSuccess) {
        await Wallet.findOneAndUpdate({ user: userId }, { $inc: { balance: amount } });
        return res.status(400).json({ message: 'Airtime purchase failed. Refunded.', tx: tx[0] });
      }

      res.json({ message: 'Airtime sent successfully', tx: tx[0], balance: wallet.balance });

    } catch (providerErr) {
      tx[0].status = TX_STATUS.FAILED;
      await tx[0].save();
      await Wallet.findOneAndUpdate({ user: userId }, { $inc: { balance: amount } });
      res.status(502).json({ message: 'Provider error. Refunded.', error: providerErr.message });
    }

  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get airtime purchase history for logged-in user
 * @route   GET /api/vtu/airtime/history
 * @access  Private
 * @query   { page, limit }
 */
export const getAirtimeHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const txns = await Transaction.find({ user: req.user._id, type: TX_TYPES.AIRTIME })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── DATA ─────────────────────────────────────────────────────────────────────

/**
 * @desc    Purchase a data bundle for any Nigerian network
 * @route   POST /api/vtu/data
 * @access  Private
 * @body    { phone, network, planId }
 */
export const buyData = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { phone, network, planId } = req.body;
    const userId = req.user._id;

    const plan = await DataPlan.findOne({ planId, network, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Data plan not found' });

    const wallet = await Wallet.findOne({ user: userId }).session(session);
    if (!wallet || wallet.balance < plan.price)
      return res.status(400).json({ message: 'Insufficient balance' });

    wallet.balance -= plan.price;
    await wallet.save({ session });

    const tx = await Transaction.create([{
      user: userId, type: TX_TYPES.DATA, amount: plan.price,
      phone, network, dataplan: plan.name,
      reference: `DATA-${Date.now()}`, status: TX_STATUS.PENDING,
    }], { session });

    await session.commitTransaction();

    try {
      const result    = await vtpass.buyData({ network, phone, planId });
      const isSuccess = result.data?.code === '000';

      tx[0].status      = isSuccess ? TX_STATUS.SUCCESS : TX_STATUS.FAILED;
      tx[0].providerRef = result.ref;
      await tx[0].save();

      if (!isSuccess) {
        await Wallet.findOneAndUpdate({ user: userId }, { $inc: { balance: plan.price } });
        return res.status(400).json({ message: 'Data purchase failed. Refunded.', tx: tx[0] });
      }

      res.json({ message: 'Data sent successfully', tx: tx[0], balance: wallet.balance });

    } catch (providerErr) {
      tx[0].status = TX_STATUS.FAILED;
      await tx[0].save();
      await Wallet.findOneAndUpdate({ user: userId }, { $inc: { balance: plan.price } });
      res.status(502).json({ message: 'Provider error. Refunded.' });
    }

  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get data bundle purchase history for logged-in user
 * @route   GET /api/vtu/data/history
 * @access  Private
 * @query   { page, limit }
 */
export const getDataHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const txns = await Transaction.find({ user: req.user._id, type: TX_TYPES.DATA })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

/**
 * @desc    Get all VTU transactions for logged-in user (filterable by type & status)
 * @route   GET /api/vtu/transactions
 * @access  Private
 * @query   { page, limit, type, status }
 */
export const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const filter = { user: req.user._id };
    if (type)   filter.type   = type;
    if (status) filter.status = status;

    const txns = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(txns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Get a single transaction by its reference
 * @route   GET /api/vtu/transactions/:reference
 * @access  Private
 */
export const getTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOne({
      reference: req.params.reference,
      user:      req.user._id,
    });
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Check live status of a transaction from VTpass
 * @route   GET /api/vtu/transactions/:reference/status
 * @access  Private
 */
export const checkTransactionStatus = async (req, res) => {
  try {
    const tx = await Transaction.findOne({
      reference: req.params.reference,
      user:      req.user._id,
    });
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    const result = await vtpass.queryTransaction(tx.reference);
    res.json({ transaction: tx, providerStatus: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Retry a previously failed transaction
 * @route   POST /api/vtu/transactions/:reference/retry
 * @access  Private
 */
export const retryTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOne({
      reference: req.params.reference,
      user:      req.user._id,
    });
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    if (tx.status !== TX_STATUS.FAILED)
      return res.status(400).json({ message: 'Only failed transactions can be retried' });

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet || wallet.balance < tx.amount)
      return res.status(400).json({ message: 'Insufficient balance' });

    wallet.balance -= tx.amount;
    await wallet.save();

    const result = tx.type === TX_TYPES.AIRTIME
      ? await vtpass.buyAirtime({ network: tx.network, phone: tx.phone, amount: tx.amount })
      : await vtpass.buyData({ network: tx.network, phone: tx.phone, planId: tx.dataplan });

    const isSuccess    = result.data?.code === '000';
    tx.status          = isSuccess ? TX_STATUS.SUCCESS : TX_STATUS.FAILED;
    tx.providerRef     = result.ref;
    await tx.save();

    if (!isSuccess) {
      await Wallet.findOneAndUpdate({ user: req.user._id }, { $inc: { balance: tx.amount } });
      return res.status(400).json({ message: 'Retry failed. Refunded.', tx });
    }

    res.json({ message: 'Retry successful', tx });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── BENEFICIARIES ────────────────────────────────────────────────────────────

/**
 * @desc    Get saved beneficiaries for logged-in user
 * @route   GET /api/vtu/beneficiaries
 * @access  Private
 * @query   { type } — optional filter e.g. airtime or data
 */
export const getBeneficiaries = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('beneficiaries');
    res.json(user?.beneficiaries || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Save a new beneficiary for logged-in user
 * @route   POST /api/vtu/beneficiaries
 * @access  Private
 * @body    { phone, network, nickname, type }
 */
export const saveBeneficiary = async (req, res) => {
  try {
    const { phone, network, nickname, type } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      $push: { beneficiaries: { phone, network, nickname, type } },
    });
    res.json({ message: 'Beneficiary saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * @desc    Delete a saved beneficiary by ID
 * @route   DELETE /api/vtu/beneficiaries/:id
 * @access  Private
 */
export const deleteBeneficiary = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { beneficiaries: { _id: req.params.id } },
    });
    res.json({ message: 'Beneficiary deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};