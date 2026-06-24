import { validateRiskExposure, calculateLotSize, RiskSnapshot, RiskLimits } from "./risk/risk_manager.js";

type ExecutionProvider = "METAAPI" | "LOCAL" | "MT5_PYTHON" | "NONE" | string;

export interface TradeSignal {
  symbol: string;
  type: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp1: number;
  timeframe?: string; // e.g. M15, H1
  [key: string]: any;
}

export interface TradeExecutor {
  executeBuy(signal: TradeSignal, volume: number, options?: any): Promise<boolean>;
  executeSell(signal: TradeSignal, volume: number, options?: any): Promise<boolean>;
  closePosition(ticketId: string): Promise<boolean>;
  modifyPosition(ticketId: string, newSl: number, newTp: number): Promise<boolean>;
  getOpenPositions(): Promise<any[]>;
  getAccountInfo?(): Promise<{ balance: number, equity: number, margin: number }>;
}

function normalizeProvider(providerName: string): ExecutionProvider {
  return (providerName || "NONE").toUpperCase();
}

/**
 * Resolve the Python MCP backend URL with /api/v1 prefix
 */
function getPyBackendUrl(): string {
  const base = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";
  return base.replace(/\/+$/, "");
}

export async function syncPositionModification(
  ticketId: string,
  sl: number,
  tp: number,
  providerName: string,
) {
  if (!ticketId) {
    throw new Error("ticketId is required for position modification.");
  }

  const provider = normalizeProvider(providerName);

  if (provider === "METAAPI") {
    return {
      success: false,
      provider,
      error:
        "MetaApi position modification is not exposed from this layer. Use the dedicated broker adapter or a position-specific service.",
      ticketId,
      sl,
      tp,
    };
  }

  if (provider === "LOCAL" || provider === "EA_BRIDGE") {
    try {
      const { EAWebhookBridge } = await import("./execution/ea_webhook.js");
      const bridge = new EAWebhookBridge();
      return bridge.route_signal_to_ea({
        id: ticketId,
        type: "MODIFY_POSITION",
        ticketId,
        sl,
        tp,
        requested_at: new Date().toISOString(),
      });
    } catch (error: any) {
      throw new Error(
        `EA bridge modification failed: ${error?.message || String(error)}`,
      );
    }
  }

  return {
    success: false,
    provider,
    error: `Unsupported execution provider: ${providerName}`,
    ticketId,
    sl,
    tp,
  };
}

export async function executeTrade(
  signal: TradeSignal,
  autotradeParams: any,
): Promise<boolean> {
  if (!signal?.symbol) {
    throw new Error("signal.symbol is required.");
  }

  if (
    !autotradeParams ||
    !autotradeParams.enabled ||
    autotradeParams.tradeMode === "MANUAL"
  ) {
    console.log(
      `[EXECUTION] Auto-trade disabled or manual mode for ${signal.symbol}. Skipping execution.`,
    );
    return false;
  }

  const provider = normalizeProvider(autotradeParams.executionProvider);

  let executor: TradeExecutor | null = null;

  if (provider === "METAAPI") {
    const { metaApiBridge } = await import("./execution/metaapi_bridge.js");
    executor = {
      executeBuy: async (sig, vol) => {
        await metaApiBridge.executeTrade(sig.symbol, "BUY", vol, sig.sl, sig.tp1);
        return true;
      },
      executeSell: async (sig, vol) => {
        await metaApiBridge.executeTrade(sig.symbol, "SELL", vol, sig.sl, sig.tp1);
        return true;
      },
      closePosition: async () => false,
      modifyPosition: async () => false,
      getOpenPositions: async () => metaApiBridge.getPositions(),
      getAccountInfo: async () => {
        if (!process.env.META_API_TOKEN || !process.env.META_API_ACCOUNT_ID) {
           throw new Error("METAAPI_NOT_CONFIGURED: Missing API Token or Account ID");
        }
        const info = await metaApiBridge.getAccountInformation();
        return { balance: info.balance, equity: info.equity, margin: info.margin };
      }
    };
  } else if (provider === "LOCAL" || provider === "MT5_PYTHON") {
    const { EAWebhookBridge } = await import("./execution/ea_webhook.js");
    const bridge = new EAWebhookBridge();
    executor = {
      executeBuy: async (sig, vol) => {
        if (sig.timeframe === "M1" || sig.timeframe === "M5") {
          console.warn(`[WARNING] Skipping HFT execution for ${sig.timeframe}. MT5_PYTHON bridge adds REST latency, scalping is dangerous.`);
          return false;
        }
        bridge.route_signal_to_ea({ id: sig.symbol, action: "BUY", symbol: sig.symbol, volume: vol, sl: sig.sl, tp: sig.tp1 });
        return true;
      },
      executeSell: async (sig, vol) => {
        if (sig.timeframe === "M1" || sig.timeframe === "M5") {
          console.warn(`[WARNING] Skipping HFT execution for ${sig.timeframe}. MT5_PYTHON bridge adds REST latency, scalping is dangerous.`);
          return false;
        }
        bridge.route_signal_to_ea({ id: sig.symbol, action: "SELL", symbol: sig.symbol, volume: vol, sl: sig.sl, tp: sig.tp1 });
        return true;
      },
      closePosition: async () => false,
      modifyPosition: async () => false,
      getOpenPositions: async () => {
        // Use the bridge's dedicated method that hits /api/v1/mt5/positions
        return await bridge.get_open_positions();
      },
      getAccountInfo: async () => {
        const info = await bridge.get_account_status();
        if (info && info.balance) {
          return { balance: info.balance, equity: info.equity || info.balance, margin: info.margin || 0 };
        }
        throw new Error("EA_BRIDGE_ACCOUNT_INFO_UNAVAILABLE: Failed to query account status from MCP.");
      }
    };
  }

  if (!executor) {
    throw new Error(`EXECUTION_PROVIDER_UNAVAILABLE: Provider ${provider} not matched or not configured.`);
  }
  
  // Risk Management Block (STRICT FAIL-CLOSED)
  try {
    let accountInfo = { balance: NaN, equity: NaN, margin: 0 };
    if (executor.getAccountInfo) {
      try {
        accountInfo = await executor.getAccountInfo();
      } catch (e: any) {
        throw new Error(`Cannot retrieve account info for risk check! Failing closed. Error: ${e.message}`);
      }
    } else {
        throw new Error(`Executor provider ${provider} does not support getAccountInfo. Risk check cannot be performed. Failing closed.`);
    }
    
    if (isNaN(accountInfo.balance) || accountInfo.balance <= 0) {
       throw new Error(`Invalid account balance ${accountInfo.balance}. Risk check failed.`);
    }

    const positions = await executor.getOpenPositions();
    
    const snap: RiskSnapshot = {
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      margin: accountInfo.margin,
      openPositionsCount: Array.isArray(positions) ? positions.length : 0,
      dailyLossPips: 0, 
      consecutiveLosses: 0,
      currentSpread: 0.5 
    };
    
    // Strict RR check
    if (signal.sl > 0 && signal.tp1 > 0) {
      const riskDist = Math.abs(signal.entry - signal.sl);
      const rewardDist = Math.abs(signal.tp1 - signal.entry);
      if (riskDist > 0) {
        const rr = rewardDist / riskDist;
        if (rr < 1.0) {
           throw new Error(`Risk Engine Rejected Trade: R:R ratio is too low (${rr.toFixed(2)}). Minimum allowed is 1:1.`);
        }
      }
    }

    const limits: RiskLimits = {
      maxDailyDrawdownPct: autotradeParams.maxDailyLoss || 5,
      maxConsecutiveLosses: 5,
      maxSpreadLimit: 30, // 3 pips
      maxPositions: autotradeParams.maxPositions || 3,
      minMarginLevelPct: 100
    };
    
    const riskCheck = validateRiskExposure(signal.symbol, snap, limits);
    if (!riskCheck.isSafe) {
      throw new Error(`Risk Engine Rejected Trade: ${riskCheck.reason}`);
    }
    
    // Auto-calc lot if requested
    const slDistancePips = Math.abs(signal.entry - signal.sl) * 10;
    const computedLot = calculateLotSize(snap.balance, 1.0 /* 1% risk maximum */, slDistancePips, signal.symbol);
    
    // Safety clamp volume bounds
    const reqVol = Number(autotradeParams.lotSize) || computedLot;
    if (reqVol > computedLot * 1.5) {
       throw new Error(`Risk Engine Rejected: Requested Volume ${reqVol} exceeds computed safe lot ${computedLot}`);
    }
    autotradeParams.lotSize = Math.max(0.01, Math.min(reqVol, computedLot));

  } catch (err: any) {
    console.error(`[EXECUTION RISK BLOCKED] ${err.message}`);
    // Fail execution entirely
    return false;
  }

  const volume = Number(autotradeParams.lotSize) || 0.01;
  const safeLotSize = Math.max(0.01, Math.min(volume, 5.0)); // Hardcap absolute volume max 5 lots directly

  try {
    let success = false;
    if (signal.type === "BUY") {
      success = await executor.executeBuy(signal, safeLotSize);
    } else {
      success = await executor.executeSell(signal, safeLotSize);
    }
    
    if (success) {
      console.log(`[EXECUTION] Order success ${signal.symbol} ${signal.type} Vol: ${safeLotSize}`);
    }
    return success;
  } catch (error) {
    console.error(`[EXECUTION] Trade execution failed for ${signal.symbol}:`, error);
    return false;
  }
}
