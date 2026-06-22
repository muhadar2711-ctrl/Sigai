import { TradeSignal } from '../../server/services/ai_adapter';

export const sendChatMessage = async (
  message: string,
  history: any[],
  image: string | null,
  temperature: number,
  model: string,
  provider: string
) => {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      image,
      temperature,
      model,
      provider,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to send chat message:', response.status, errorBody);
    throw new Error(
      `Network response was not ok. Status: ${response.status}. Body: ${errorBody}`
    );
  }

  return response.json();
};

export const getBalance = async () => {
  const response = await fetch('/api/v1/mt5/balance', {
    headers: {
      'Content-Type': 'application/json',
      'admin-secret': process.env.NEXT_PUBLIC_ADMIN_SECRET || '',
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch balance:', errorText);
    throw new Error('Failed to fetch balance');
  }
  return response.json();
};

export const getPositions = async () => {
  const response = await fetch('/api/v1/mt5/positions', {
    headers: {
      'Content-Type': 'application/json',
      'admin-secret': process.env.NEXT_PUBLIC_ADMIN_SECRET || '',
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch positions:', errorText);
    throw new Error('Failed to fetch positions');
  }
  return response.json();
};

export const executeTrade = async (signal: TradeSignal) => {
  const response = await fetch('/api/v1/mt5/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'admin-secret': process.env.NEXT_PUBLIC_ADMIN_SECRET || '',
    },
    body: JSON.stringify(signal),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Failed to execute trade:', response.status, errorBody);
    throw new Error(`Failed to execute trade. Status: ${response.status}`);
  }

  return response.json();
};

export const getMcpStatus = async () => {
  const response = await fetch('/api/mcp/status');
  if (!response.ok) {
    throw new Error('Failed to fetch MCP status');
  }
  return response.json();
};
