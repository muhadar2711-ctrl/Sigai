export class EAWebhookBridge {
  public active_orders: Record<string, any> = {};

  private getBaseUrl(): string {
    const base = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";
    // Backend M uses /api/v1 prefix for all endpoints
    return base.replace(/\/+$/, "");
  }

  async route_signal_to_ea(
    signal: any,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    console.log(
      "[EA_BRIDGE] Routing signal to Python MCP Server -> MT5 EA:",
      signal,
    );

    const baseUrl = this.getBaseUrl();

    try {
      const response = await fetch(`${baseUrl}/api/v1/mt5/webhook?target_id=ea_webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": process.env.ADMIN_SECRET || "",
        },
        body: JSON.stringify({
          payload: {
            symbol: signal.symbol,
            action: signal.type,
            volume: signal.volume || 0.01,
            sl: signal.sl,
            tp: signal.tp,
          }
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Python MCP responded with status ${response.status}: ${errBody}`);
      }

      const result = await response.json();

      if (result && result.ticketId) {
        this.active_orders[result.ticketId] = result;
      }

      return { success: true, result };
    } catch (e: any) {
      console.error(
        "[EA_BRIDGE] Failed to route signal to MT5 EA via Python MCP:",
        e.message,
      );
      return { success: false, error: e.message };
    }
  }

  async get_account_status(): Promise<any> {
    const baseUrl = this.getBaseUrl();

    try {
      const response = await fetch(`${baseUrl}/api/v1/mt5/balance`, {
        method: "GET",
        headers: {
            "x-admin-token": process.env.ADMIN_SECRET || ""
        }
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Python MCP HTTP Error ${response.status}: ${errBody}`);
      }
      return await response.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async get_open_positions(): Promise<any[]> {
    const baseUrl = this.getBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/mt5/positions`, {
        method: "GET",
        headers: {
          "x-admin-token": process.env.ADMIN_SECRET || "",
        },
      });
      if (!response.ok) {
        console.error(`[EA_BRIDGE] Failed to fetch positions: ${response.status}`);
        return [];
      }
      const data = await response.json();
      return data.positions || (Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error("[EA_BRIDGE] Error fetching positions:", e.message);
      return [];
    }
  }
}
