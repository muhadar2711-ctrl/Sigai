
import { systemState, addSystemError, updateStrategyState, setSystemStatus } from "../state/state_manager.js";
import { getAllStrategies, Strategy } from "../strategies/index.js";
import { getMarketData, OHLC } from "./data_engine.js";
import { sendTelegramSignal } from "../telegram.js";
import { validateSignalWithAI } from "../routes/ai_engine.js";
import { checkNewsBlock } from "../news_engine.js";
import { TradeSignal, StrategyStatus } from "../strategies/types.js";

async function runStrategies() {
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

            if (!data || data.length === 0) {
                console.log(`[ENGINE] No data for ${strat.config.symbol}, skipping strategy.`);
                continue;
            }

            console.log(`[ENGINE] Running [${strat.name}] for ${strat.config.symbol}...`);
            const signal: TradeSignal | null = await strat.run(data, strat.config);

            if (signal) {
                console.log(`[ENGINE] Signal found for ${strat.config.symbol} by ${strat.name}.`);
                updateStrategyState(strat.strategyId, { status: StrategyStatus.SIGNAL_READY, lastSignal: signal });

                // Perform AI Validation
                const { verdict, reason } = await validateSignalWithAI(signal);
                signal.ai_verdict = verdict;
                signal.ai_reason = reason;

                // Check for news block
                const isNewsBlocked = await checkNewsBlock(signal.symbol);

                // Final Decision Point
                if (verdict === "APPROVED" && !isNewsBlocked) {
                    console.log(`[ENGINE] Signal for ${signal.symbol} APPROVED and not blocked by news. Sending to Telegram.`);
                    // The signal object now correctly matches the TradeSignal type
                    await sendTelegramSignal(signal, systemState);
                } else {
                    console.log(`[ENGINE] Signal for ${signal.symbol} REJECTED by AI or blocked by news.`);
                }

            } else {
                updateStrategyState(strat.strategyId, { status: StrategyStatus.IDLE });
            }
        } catch (error: any) {
            console.error(`[ENGINE] Error running strategy ${strat.name}:`, error);
            addSystemError("STRATEGY_EXECUTION_ERROR", { strategy: strat.name, error: error.message });
            updateStrategyState(strat.strategyId, { status: StrategyStatus.ERROR });
        }
    }
    console.log("[ENGINE] Strategy run complete.");
}

export function bootstrapSystem() {
    setSystemStatus("BOOTSTRAPPING");
    console.log("[ENGINE] Bootstrapping system...");

    const strategies = getAllStrategies();
    systemState.strategies = strategies.map((s: Strategy) => ({
        name: s.name,
        strategyId: s.strategyId,
        enabled: s.enabled,
        status: StrategyStatus.ON,
        setupState: {},
        performance: {
            dailyTrades: 0,
            wins: 0,
            losses: 0,
            winrate: 0,
            dailyPnl: 0,
        },
        debugAudit: {},
        lastSignal: null,
    }));

    // Initial run, then set interval
    runStrategies();
    setInterval(runStrategies, 60000); // Run every 60 seconds

    console.log("[ENGINE] System bootstrapped and running.");
}
