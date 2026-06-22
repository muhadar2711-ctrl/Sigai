import axios from 'axios';
import { TradeSignal } from '../services/ai_adapter';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8000';

export const queryMCPServer = async (signal: TradeSignal) => {
  try {
    const response = await axios.post(`${MCP_SERVER_URL}/api/v1/mt5/webhook`, signal, {
        headers: {
            'Content-Type': 'application/json',
            'admin-secret': process.env.ADMIN_SECRET || '',
        },
    });

    return response.data;
  } catch (error: any) {
    console.error('Failed to query MCP server:', error.response?.data || error.message);
    throw new Error('Could not connect to the MCP server for execution.');
  }
};

export const EAWebhookBridge = async (signal: TradeSignal) => {
  console.log('Executing trade via EA Webhook Bridge:', signal);
  return await queryMCPServer(signal);
};
