export class EAWebhookBridge {
  public active_orders: Record<string, any> = {};

  async route_signal_to_ea(
    signal: any,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    console.log(
      "[EA_BRIDGE] Routing signal to Python MCP Server -> MT5 EA:",
      signal,
    );

    // We send to the Python MCP which handles MT5 bridging
    const pyBackendUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";

    try {
      const response = await fetch(`${pyBackendUrl}/mt5/webhook?target_id=ea_webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        throw new Error(`Python MCP responded with status ${response.status}`);
      }

      const result = await response.json();

      // Update local state if needed
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
    const pyBackendUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";

    try {
      const response = await fetch(`${pyBackendUrl}/mt5/balance`, {
        method: "GET",
        headers: {
            "x-admin-token": process.env.ADMIN_SECRET || ""
        }
      });
      if (!response.ok) {
        throw new Error(`Python MCP HTTP Error ${response.status}`);
      }
      return await response.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
