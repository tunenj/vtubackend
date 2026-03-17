import { Router } from 'express';
import protect from '../middleware/auth.js';
import * as wallet from '../controllers/walletController.js';

const router = Router();

// Public (Paystack calls this — no JWT)
router.post('/webhook/paystack', wallet.paystackWebhook);

// All routes below require login
router.use(protect);

router.get('/balance',                    wallet.getBalance);
router.get('/summary',                    wallet.getSummary);
router.post('/fund/initialize',           wallet.initializeFunding);
router.post('/fund/verify',               wallet.verifyFunding);
router.post('/transfer',                  wallet.transfer);
router.post('/pin/set',                   wallet.setPin);
router.get('/transactions',               wallet.getTransactions);
router.get('/transactions/:reference',    wallet.getTransaction);

export default router;