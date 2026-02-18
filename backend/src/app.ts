import express from 'express';
import cors from 'cors';
import compression from 'compression';
import 'dotenv/config';
import agentRoutes from './routes/agent.routes.js';
import paymentsRoutes from './routes/payments.js';
import { loadEnvConfig } from './config/env.js';
import { logger } from './utils/logger.js';

// Load and validate environment variables
const config = loadEnvConfig();

const app = express();

// Compression middleware for mobile data savings
app.use(compression());

// CORS configured for mobile apps
app.use(cors({
  origin: (origin, callback) => {
    // Mobile apps may not send origin header
    if (!origin) return callback(null, true);

    if (config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow all origins for mobile apps (security is in userId verification)
    callback(null, true);
  },
  credentials: true
}));

// Body parser with size limit for mobile
app.use(express.json({ limit: '50kb' }));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    }
  });
});

// Routes
app.use('/api/payments', paymentsRoutes);
app.use('/agent', agentRoutes);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(config.port, config.host, () => {
  logger.info('Backend started', {
    host: config.host,
    port: config.port,
    env: config.nodeEnv,
  });
});
