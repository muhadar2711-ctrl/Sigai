import { Router } from 'express';
import axios from 'axios';
import { authenticate } from './middleware';

const router = Router();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8000';

// Proxy MT5 balance endpoint
router.get('/mt5/balance', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/api/v1/mt5/balance`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching balance from MCP server:', error);
    res.status(503).json({ error: 'MCP server unavailable' });
  }
});

// Proxy MT5 positions endpoint
router.get('/mt5/positions', authenticate, async (req, res) => {
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/api/v1/mt5/positions`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching positions from MCP server:', error);
    res.status(503).json({ error: 'MCP server unavailable' });
  }
});

// Proxy MT5 webhook endpoint
router.post('/mt5/webhook', authenticate, async (req, res) => {
  try {
    const response = await axios.post(`${MCP_SERVER_URL}/api/v1/mt5/webhook`, req.body, {
      headers: { 'Content-Type': 'application/json' },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error forwarding webhook to MCP server:', error);
    res.status(503).json({ error: 'MCP server unavailable' });
  }
});

export default router;
