import { Router } from 'express';
import fetch from 'node-fetch';
import { authenticate } from './middleware';

const router = Router();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8000';

// Proxy MT5 balance endpoint
router.get('/mt5/balance', authenticate, async (req, res) => {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/api/v1/mt5/balance`);
    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching balance from MCP server:', error);
    res.status(503).json({ error: 'MCP server unavailable' });
  }
});

// Proxy MT5 positions endpoint
router.get('/mt5/positions', authenticate, async (req, res) => {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/api/v1/mt5/positions`);
    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching positions from MCP server:', error);
    res.status(503).json({ error: 'MCP server unavailable' });
  }
});

// Proxy MT5 webhook endpoint
router.post('/mt5/webhook', authenticate, async (req, res) => {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/api/v1/mt5/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error forwarding webhook to MCP server:', error);
    res.status(503).json({ error: 'MCP server unavailable' });
  }
});

export default router;
