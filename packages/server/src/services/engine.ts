
import { systemState, addSystemError, updateStrategyState, setSystemStatus } from "../state/state_manager.js";
import { getAllStrategies, Strategy } from "../strategies/index.js";
import { getMarketData, OHLC } from "./data_engine.js";
import { sendTelegramSignal } from "../telegram.js";
import { validateSignalWithAI } from "../routes/ai_engine.js";
import { checkNewsBlock } from "../news_engine.js";
import { TradeSignal, StrategyStatus, StrategyState } from "../strategies/types.js";

let isEngineRunning = false;

async function runStrategies() {
    if (isEngineRunning) {
        console.log("[ENGINE] Previous execution is still running. Skipping this cycle.");
        return;
    }

    isEngineRunning = true;
    try {
        setSystemStatus("RUNNING");
        console.log("[ENGINE] Running strategies...");

        const strategies = getAllStrategies();
        for (const strat of strategies) {
            if (!strat.enabled) continue;

            try {
                updateStrategyState(strat.strategyId, { status: StrategyStatus.SCANNING });

                const data: OHLC[] = await getMarketData(
                    strat.config.symbol,
                    strat.config.ltfTimeframe,
                    strat.config.ltfLookback
                );

                if (data.length === 0) {
                    console.log(`[ENGINE] No data for ${strat.config.symbol}, skipping strategy.`);
                    updateStrategyState(strat.strategyId, { status: StrategyStatus.IDLE, lastMessage: "No market data." });
                    continue;
                }

                console.log(`[ENGINE] Running [${strat.name}] for ${strat.config.symbol}...`);
                const signal: TradeSignal | null = await strat.run(data, strat.config);

                if (signal) {
                    console.log(`[ENGINE] Signal found for ${strat.config.symbol} by ${strat.name}.`);
                    updateStrategyState(strat.strategyId, { status: StrategyStatus.SIGNAL_READY, lastSignal: signal });

                    const { verdict, reason } = await validateSignalWithAI(signal);
                    // FIX: Ensure the verdict string is correctly typed
                    signal.ai_verdict = verdict as 'APPROVED' | 'REJECTED' | 'PENDING';
                    signal.ai_reason = reason;

                    const isNewsBlocked = await checkNewsBlock(signal.symbol);

                    if (verdict === "APPROVED" && !isNewsBlocked) {
                        console.log(`[ENGINE] Signal for ${signal.symbol} APPROVED. Sending to Telegram.`);
                        await sendTelegramSignal(signal, systemState);
                    } else {
                        console.log(`[ENGINE] Signal for ${signal.symbol} REJECTED or BLOCKED.`);
                    }

                } else {
                    updateStrategyState(strat.strategyId, { status: StrategyStatus.IDLE, lastMessage: "No signal generated." });
                }
            } catch (error: any) {
                console.error(`[ENGINE] Error running strategy ${strat.name}:`, error);
                addSystemError("STRATEGY_EXECUTION_ERROR", { strategy: strat.name, error: error.message });
                updateStrategyState(strat.strategyId, { status: StrategyStatus.ERROR, lastMessage: error.message });
            }
        }
        console.log("[ENGINE] Strategy run complete.");
    } finally {
        isEngineRunning = false;
        setSystemStatus("IDLE");
    }
}

export function bootstrapSystem() {
    setSystemStatus("BOOTSTRAPPING");
    console.log("[ENGINE] Bootstrapping system...");

    const strategies = getAllStrategies();
    
    systemState.strategies = strategies.reduce((acc, s: Strategy) => {
        acc[s.strategyId] = {
            name: s.name,
            strategyId: s.strategyId,
            enabled: s.enabled,
            status: StrategyStatus.ON,
            setupState: {},
            performance: { dailyTrades: 0, wins: 0, losses: 0, winrate: 0, dailyPnl: 0 },
            debugAudit: {},
            lastSignal: null,
            lastMessage: "System initialized.",
        };
        return acc;
    }, {} as { [key: string]: StrategyState });

    const runCycle = () => {
        runStrategies().catch(err => {
            console.error("[ENGINE_CRITICAL] Unhandled error in runStrategies loop:", err);
        });
    };

    runCycle();
    setInterval(runCycle, 60000); 

    console.log("[ENGINE] System bootstrapped and running.");
}
