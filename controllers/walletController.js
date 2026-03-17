import mongoose from 'mongoose';
import crypto   from 'crypto';
import bcrypt   from 'bcryptjs';
import axios    from 'axios';
import Wallet      from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import User        from '../models/User.js';
import { TX_STATUS, TX_TYPES } from '../config/constants.js';

// ─────────────────────────────────────────
// GET WALLET BALANCE
// GET /api/wallet/balance
// ─────────────────────────────────────────
export const getBalance = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet)
      return res.status(404).json({ message: 'Wallet not found' });

    res.json({
      balance:     wallet.balance,
      currency:    wallet.currency,
      isActive:    wallet.isActive,
      lastUpdated: wallet.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────
// FUND WALLET VIA PAYSTACK (Initialize)
// POST /api/wallet/fund/initialize
// Body: { amount }
// ─────────────────────────────────────────
export const initializeFunding = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 100)
      return res.status(400).json({ message: 'Minimum funding amount is ₦100' });

    const user      = await User.findById(req.user._id);
    const reference = `FUND-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:        user.email,
        amount:       amount * 100, // Paystack uses kobo
        reference,
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        metadata:     { userId: req.user._id.toString(), type: 'wallet_fund' },
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    await Transaction.create({
      user:      req.user._id,
      type:      TX_TYPES.WALLET_FUND,
      amount,
      reference,
      status:    TX_STATUS.PENDING,
    });

    res.json({
      authorizationUrl: response.data.data.authorization_url,
      reference,
      amount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────
// VERIFY PAYSTACK PAYMENT & CREDIT WALLET
// POST /api/wallet/fund/verify
// Body: { reference }
// ─────────────────────────────────────────
export const verifyFunding = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { reference } = req.body;

    if (!reference)
      return res.status(400).json({ message: 'Reference is required' });

    const existingTx = await Transaction.findOne({ reference });
    if (!existingTx)
      return res.status(404).json({ message: 'Transaction not found' });
    if (existingTx.status === TX_STATUS.SUCCESS)
      return res.status(400).json({ message: 'Transaction already processed' });

    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const { status, amount } = paystackRes.data.data;

    if (status !== 'success') {
      existingTx.status = TX_STATUS.FAILED;
      await existingTx.save();
      await session.abortTransaction();
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const amountInNaira = amount / 100;

    const wallet = await Wallet.findOneAndUpdate(
      { user: req.user._id },
      { $inc: { balance: amountInNaira } },
      { new: true, session }
    );

    existingTx.status      = TX_STATUS.SUCCESS;
    existingTx.providerRef = paystackRes.data.data.id;
    existingTx.meta        = { channel: paystackRes.data.data.channel };
    await existingTx.save({ session });

    await session.commitTransaction();

    res.json({
      message:      'Wallet funded successfully',
      amountFunded: amountInNaira,
      newBalance:   wallet.balance,
      reference,
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────
// PAYSTACK WEBHOOK (called by Paystack server)
// POST /api/wallet/webhook/paystack
// ─────────────────────────────────────────
export const paystackWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature'])
      return res.status(401).json({ message: 'Invalid signature' });

    const { event, data } = req.body;

    if (event === 'charge.success') {
      const { reference, amount, metadata } = data;
      const userId = metadata?.userId;

      if (!userId) {
        await session.abortTransaction();
        return res.sendStatus(200);
      }

      const tx = await Transaction.findOne({ reference }).session(session);
      if (!tx || tx.status === TX_STATUS.SUCCESS) {
        await session.abortTransaction();
        return res.sendStatus(200);
      }

      const amountInNaira = amount / 100;

      await Wallet.findOneAndUpdate(
        { user: userId },
        { $inc: { balance: amountInNaira } },
        { session }
      );

      tx.status      = TX_STATUS.SUCCESS;
      tx.providerRef = data.id;
      await tx.save({ session });

      await session.commitTransaction();
    }

    res.sendStatus(200);
  } catch (err) {
    await session.abortTransaction();
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────
// TRANSFER / SEND TO ANOTHER USER
// POST /api/wallet/transfer
// Body: { recipientPhone, amount, pin }
// ─────────────────────────────────────────
export const transfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { recipientPhone, amount, pin } = req.body;
    const senderId = req.user._id;

    if (!amount || amount < 50)
      return res.status(400).json({ message: 'Minimum transfer is ₦50' });

    const sender   = await User.findById(senderId);
    const pinMatch = await bcrypt.compare(pin, sender.pin || '');
    if (!pinMatch)
      return res.status(401).json({ message: 'Incorrect transaction PIN' });

    const recipient = await User.findOne({ phone: recipientPhone });
    if (!recipient)
      return res.status(404).json({ message: 'Recipient not found' });
    if (recipient._id.toString() === senderId.toString())
      return res.status(400).json({ message: 'Cannot transfer to yourself' });

    const senderWallet = await Wallet.findOne({ user: senderId }).session(session);
    if (!senderWallet || senderWallet.balance < amount)
      return res.status(400).json({ message: 'Insufficient balance' });

    const ref = `TRF-${Date.now()}`;

    senderWallet.balance -= amount;
    await senderWallet.save({ session });

    await Wallet.findOneAndUpdate(
      { user: recipient._id },
      { $inc: { balance: amount } },
      { session }
    );

    await Transaction.insertMany([
      {
        user:      senderId,
        type:      'transfer_out',
        amount,
        reference: `${ref}-OUT`,
        status:    TX_STATUS.SUCCESS,
        meta:      { recipientId: recipient._id, recipientPhone },
      },
      {
        user:      recipient._id,
        type:      'transfer_in',
        amount,
        reference: `${ref}-IN`,
        status:    TX_STATUS.SUCCESS,
        meta:      { senderId, senderPhone: sender.phone },
      },
    ], { session });

    await session.commitTransaction();

    res.json({
      message:    `₦${amount} sent to ${recipient.name} successfully`,
      newBalance: senderWallet.balance,
      reference:  ref,
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────
// GET TRANSACTION HISTORY
// GET /api/wallet/transactions?page=1&limit=20&type=airtime
// ─────────────────────────────────────────
export const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (type)   filter.type   = type;
    if (status) filter.status = status;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      transactions,
      pagination: {
        total,
        page:    Number(page),
        pages:   Math.ceil(total / limit),
        hasNext: skip + transactions.length < total,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────
// GET SINGLE TRANSACTION
// GET /api/wallet/transactions/:reference
// ─────────────────────────────────────────
export const getTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOne({
      reference: req.params.reference,
      user:      req.user._id,
    });

    if (!tx)
      return res.status(404).json({ message: 'Transaction not found' });

    res.json(tx);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────
// SET TRANSACTION PIN
// POST /api/wallet/pin/set
// Body: { pin } — 4-digit string
// ─────────────────────────────────────────
export const setPin = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!/^\d{4}$/.test(pin))
      return res.status(400).json({ message: 'PIN must be exactly 4 digits' });

    const hashedPin = await bcrypt.hash(pin, 12);
    await User.findByIdAndUpdate(req.user._id, { pin: hashedPin });

    res.json({ message: 'Transaction PIN set successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────
// WALLET SUMMARY (stats for dashboard)
// GET /api/wallet/summary
// ─────────────────────────────────────────
export const getSummary = async (req, res) => {
  try {
    const userId       = req.user._id;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [wallet, stats] = await Promise.all([
      Wallet.findOne({ user: userId }),
      Transaction.aggregate([
        {
          $match: {
            user:      new mongoose.Types.ObjectId(userId),
            createdAt: { $gte: startOfMonth },
            status:    TX_STATUS.SUCCESS,
          },
        },
        {
          $group: {
            _id:         '$type',
            totalAmount: { $sum: '$amount' },
            count:       { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = stats.reduce((acc, item) => {
      acc[item._id] = { total: item.totalAmount, count: item.count };
      return acc;
    }, {});

    res.json({
      balance:  wallet?.balance || 0,
      currency: 'NGN',
      thisMonth: {
        airtime:   summary.airtime       || { total: 0, count: 0 },
        data:      summary.data          || { total: 0, count: 0 },
        funded:    summary.wallet_fund   || { total: 0, count: 0 },
        transfers: summary.transfer_out  || { total: 0, count: 0 },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};