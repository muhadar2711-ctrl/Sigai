
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import axios from 'axios';
import { initializeEngines } from './services/engine.js';
import { aiRouter } from './routes/ai_engine.js';
import { EAWebhookBridge } from './services/execution/ea_webhook.js';

// Fungsi untuk query ke MCP Server
async function queryMCPServer(endpoint: string) {
  const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
  if (!MCP_SERVER_URL) {
    throw new Error('MCP_SERVER_URL is not defined in environment variables.');
  }
  const response = await axios.get(`${MCP_SERVER_URL}${endpoint}`);
  return response.data;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const __dirname = path.dirname(new URL(import.meta.url).pathname);

  // --- Direktori Struktural ---
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.error('Gagal membuat direktori struktural:', e);
  }

  // --- Middleware ---
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-grok-key', 'x-webhook-token'],
    }),
  );

  // --- Rute API ---
  app.get('/health', (req, res) => res.status(200).send('OK'));
  app.use('/api/ai', aiRouter);

  app.get('/api/mcp/status', async (req, res) => {
    try {
      const response = await queryMCPServer('/api/v1/status');
      res.json(response);
    } catch (error: any) {
      console.error('[MCP Status] Gagal mengambil status:', error.message);
      res.status(503).json({ 
        status: 'UNAVAILABLE', 
        error: 'Tidak dapat terhubung ke MCP server.',
        details: error.message,
      });
    }
  });

  app.post('/api/v1/trade/execute', async (req, res) => {
    try {
      const bridge = new EAWebhookBridge();
      const result = await bridge.send_signal(req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Trade Execute] Gagal meneruskan sinyal:', error);
      res.status(500).json({ success: false, error: 'Gagal mengeksekusi perdagangan.', details: error.message });
    }
  });

  // --- Inisialisasi Mesin ---
  initializeEngines();

  // --- Server untuk File Statis (Hanya di Produksi) ---
  if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.resolve(__dirname, '../../dist/client'); // Corrected path
    app.use(express.static(clientBuildPath));

    // Fallback ke index.html untuk Single Page Application
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
