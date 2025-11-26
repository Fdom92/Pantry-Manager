import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import agentRoutes from './routes/agent.routes.js';
import paymentsRoutes from './routes/payments.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/payments', paymentsRoutes);
app.use('/agent', agentRoutes);

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Backend running on http://${HOST}:${PORT}`);
});
