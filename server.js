import express    from 'express';
import cors       from 'cors';
import helmet     from 'helmet';
import morgan     from 'morgan';
import rateLimit  from 'express-rate-limit';
import dotenv     from 'dotenv';
import connectDB  from './config/db.js';
import authRoutes   from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import vtuRoutes    from './routes/vtu.js';

dotenv.config();
connectDB();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ─── Root Route ───────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'VTU Backend API is running ✅',
    version: '1.0.0',
    routes: {
      auth:   '/api/auth',
      wallet: '/api/wallet',
      vtu:    '/api/vtu',
    },
  });
});

// ─── API Routes ───────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/vtu',    vtuRoutes);

// ─── 404 Handler ──────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────
app.use((err, req, res, next) => {
  console.error(`[${req.method}] ${req.originalUrl} →`, err.message);
  res.status(err.status || 500).json({ message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));