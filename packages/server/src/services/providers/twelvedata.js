
// This file is a placeholder for a more complete TwelveData API client.
import { addSystemError } from '../../state/state_manager.js';

const API_KEY = process.env.TWELVEDATA_API_KEY;
const BASE_URL = 'https://api.twelvedata.com';

export const TwelveData = {
  async getMarketData(symbol, timeframe, lookback) {
    if (!API_KEY) {
      throw new Error('TwelveData API key is not set.');
    }

    const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=${timeframe}&outputsize=${lookback}&apikey=${API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.message || 'Unknown TwelveData API error');
      }

      // Map the response to the standard OHLC format
      return data.values.map(v => ({
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        time: new Date(v.datetime).getTime() / 1000,
        volume: v.volume ? parseInt(v.volume, 10) : 0,
      })).reverse(); // API returns newest first, reverse it

    } catch (error) {
      addSystemError('TWELVEDATA_FETCH_FAILED', { error, symbol });
      return [];
    }
  },
};
