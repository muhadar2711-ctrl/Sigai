import fetch from 'node-fetch';
import { TradeSignal } from '../services/ai_adapter';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8000';

export const queryMCPServer = async (signal: TradeSignal) => {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/api/v1/mt5/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'admin-secret': process.env.ADMIN_SECRET || '',
      },
      body: JSON.stringify(signal),
    });

    if (!response.ok) {
      console.error(
        `MCP server returned an error: ${response.status}`,
        await response.text()
      );
      throw new Error(`MCP server request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to query MCP server:', error);
    throw new Error('Could not connect to the MCP server for execution.');
  }
};

export const EAWebhookBridge = async (signal: TradeSignal) => {
  console.log('Executing trade via EA Webhook Bridge:', signal);
  // In a real scenario, this would format and send the signal to a MetaTrader EA.
  // For now, we'll just log it and rely on the MCP server query.
  return await queryMCPServer(signal);
};
