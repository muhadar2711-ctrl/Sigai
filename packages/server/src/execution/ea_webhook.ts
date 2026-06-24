import axios, { AxiosInstance } from 'axios';

/**
 * EAWebhookBridge Class
 * Bridge eksekusi antara Sigai-main dan Backend M (Python MCP).
 * Mengimplementasikan audit trace dan validasi evidence ketat.
 */
export class EAWebhookBridge {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.MCP_SERVER_URL || 'http://localhost:8000').replace(/\/+$/, "");
    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'admin-secret': process.env.ADMIN_SECRET || '',
      },
    });
  }

  /**
   * Log audit trace untuk kepatuhan operasional (asia_session.md)
   */
  private logAudit(action: string, url: string, payload: any, response: any) {
    console.log(`[AUDIT_TRACE] ${new Date().toISOString()} | Action: ${action}`);
    console.log(`URL: ${url}`);
    console.log(`Payload: ${JSON.stringify(payload)}`);
    console.log(`Status: ${response?.status || 'N/A'}`);
  }

  /**
   * Mengirim sinyal ke EA setelah validasi evidence
   */
  async send_signal(signal: any) {
    const { symbol, action, sl, tp, volume } = signal;

    // DECISION LOGIC: Check for insufficient evidence
    if (!symbol || !action || !sl || !tp || !volume || sl === 0 || tp === 0 || volume === 0) {
      console.error(`[EXECUTION_REJECTED] Insufficient evidence for trade:`, signal);
      return {
        success: false,
        status: 'REJECT',
        reason: 'INSUFFICIENT_EVIDENCE',
        details: 'Missing or zero value for critical trade parameters (symbol, action, sl, tp, volume).'
      };
    }

    try {
      const response = await this.client.post('/mt5/webhook', signal);
      this.logAudit('SEND_SIGNAL', `${this.baseUrl}/api/v1/mt5/webhook`, signal, response);
      return response.data;
    } catch (error: any) {
      this.handleConnectionError(error, 'SEND_SIGNAL');
    }
  }

  /**
   * Alias untuk send_signal untuk kompatibilitas dengan execution.ts
   */
  async route_signal_to_ea(signal: any) {
    return await this.send_signal(signal);
  }

  /**
   * Mengambil posisi terbuka dari terminal MT5 via Backend M
   */
  async get_open_positions() {
    try {
      const response = await this.client.get('/mt5/positions');
      this.logAudit('GET_POSITIONS', `${this.baseUrl}/api/v1/mt5/positions`, null, response);
      return response.data;
    } catch (error: any) {
      this.handleConnectionError(error, 'GET_POSITIONS');
    }
  }

  /**
   * Mengambil status akun (balance, equity, margin)
   */
  async get_account_status() {
    try {
      const response = await this.client.get('/mt5/balance');
      this.logAudit('GET_ACCOUNT_STATUS', `${this.baseUrl}/api/v1/mt5/balance`, null, response);
      return response.data;
    } catch (error: any) {
      this.handleConnectionError(error, 'GET_ACCOUNT_STATUS');
    }
  }

  /**
   * Centralized error handling untuk kegagalan koneksi
   */
  private handleConnectionError(error: any, action: string) {
    const isNetworkError = error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout');
    
    console.error(`[BRIDGE_ERROR] ${action} failed:`, error.response?.data || error.message);
    
    if (isNetworkError) {
      throw new Error('MCP_SERVER_UNREACHABLE');
    }
    
    throw new Error(error.response?.data?.error || `Gagal menjalankan aksi ${action} pada server M.`);
  }
}

// Export function for legacy support if needed
export const queryMCPServer = async (signal: any) => {
  const bridge = new EAWebhookBridge();
  return await bridge.send_signal(signal);
};