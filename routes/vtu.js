import { Router } from 'express';
import protect from '../middleware/auth.js';
import {
  getNetworks,
  getDataPlans,
  syncDataPlans,
  buyAirtime,
  buyData,
  getTransactions,
  getTransaction,
  retryTransaction,
  checkTransactionStatus,
  getAirtimeHistory,
  getDataHistory,
  getBeneficiaries,
  saveBeneficiary,
  deleteBeneficiary,
} from '../controllers/vtuController.js';

const router = Router();

// ─────────────────────────────────────────
// PUBLIC ROUTES (no auth required)
// ─────────────────────────────────────────

// Get all supported networks
router.get('/networks', getNetworks);

// Get data plans for a specific network
// e.g. GET /api/vtu/plans/mtn
router.get('/plans/:network', getDataPlans);

// ─────────────────────────────────────────
// ALL ROUTES BELOW REQUIRE AUTH TOKEN
// ─────────────────────────────────────────
router.use(protect);

// ─── AIRTIME ───────────────────────────
router.post('/airtime', buyAirtime);
router.get('/airtime/history', getAirtimeHistory);

// ─── DATA BUNDLE ───────────────────────
router.post('/data', buyData);
router.get('/data/history', getDataHistory);

// ─── TRANSACTIONS ───────────────────────
router.get('/transactions', getTransactions);
router.get('/transactions/:reference', getTransaction);
router.get('/transactions/:reference/status', checkTransactionStatus);
router.post('/transactions/:reference/retry', retryTransaction);

// ─── BENEFICIARIES ──────────────────────
router.get('/beneficiaries', getBeneficiaries);
router.post('/beneficiaries', saveBeneficiary);
router.delete('/beneficiaries/:id', deleteBeneficiary);

// ─── ADMIN ONLY ──────────────────────────
router.post('/plans/sync', syncDataPlans);

export default router;