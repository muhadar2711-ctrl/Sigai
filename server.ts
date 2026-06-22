
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { initializeEngines, queryMCPServer } from './server/engine';
import { aiRouter } from './server/ai_engine';
import { EAWebhookBridge } from './server/execution/ea_webhook';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // --- Direktori Struktural ---
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const aiLogFile = path.join(logsDir, 'ai.log');
    if (!fs.existsSync(aiLogFile)) fs.writeFileSync(aiLogFile, '', 'utf-8');
  } catch (e) {
    console.error('Gagal membuat direktori struktural:', e);
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // --- CORS ---
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-admin-token',
        'x-grok-key',
        'x-webhook-token',
      ],
    }),
  );

  // --- Rute API Inti ---
  app.use('/api/ai', aiRouter);

  // --- Rute Status MCP (Kontrak Baru) ---
  app.get('/api/mcp/status', async (req, res) => {
    try {
      // Panggil endpoint status terpusat di backend M
      const response = await queryMCPServer('/api/v1/status');
      // Pastikan backend Sigai meneruskan data mentah dari M
      res.json(response);
    } catch (error: any) {
      console.error('[MCP Status] Gagal mengambil status dari server M:', error.message);
      // Kirim error yang jelas ke frontend
      res.status(503).json({ 
        status: 'UNAVAILABLE', 
        error: 'Tidak dapat terhubung ke MCP server.',
        details: error.message,
      });
    }
  });

  // --- Rute Eksekusi Perdagangan (Kontrak Baru) ---
  app.post('/api/v1/trade/execute', async (req, res) => {
    try {
      const signal = req.body;
      const bridge = new EAWebhookBridge();
      // Validasi sinyal di sini jika perlu
      const result = await bridge.send_signal(signal);
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Trade Execute] Gagal meneruskan sinyal:', error);
      res.status(500).json({ success: false, error: 'Gagal mengeksekusi perdagangan.', details: error.message });
    }
  });


  // --- Inisialisasi Mesin ---
  initializeEngines();

  // --- Vite & Static Server ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const publicPath = path.join(process.cwd(), 'dist/public');
    app.use(express.static(publicPath));
    app.use('*', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${PORT}`);
  });
}

startServer();
