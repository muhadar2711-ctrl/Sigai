export interface RiskSnapshot {
  balance: number;
  equity: number;
  margin: number;
  openPositionsCount: number;
  dailyLossPips: number;
  consecutiveLosses: number;
  currentSpread: number;
}

export interface RiskLimits {
  maxDailyDrawdownPct: number;
  maxConsecutiveLosses: number;
  maxSpreadLimit: number;
  maxPositions: number;
  minMarginLevelPct: number;
}

export function validateRiskExposure(
  symbol: string,
  snapshot: RiskSnapshot,
  limits: RiskLimits
): { isSafe: boolean; reason?: string } {
  // 1. Core Capital Check
  if (snapshot.equity <= 0 || snapshot.balance <= 0) {
    return { isSafe: false, reason: "SYSTEM HALT: Invalid account balance/equity." };
  }

  // 2. Daily Drawdown Guard
  const ddPercentage = ((snapshot.balance - snapshot.equity) / snapshot.balance) * 100;
  if (ddPercentage >= limits.maxDailyDrawdownPct) {
    return {
      isSafe: false,
      reason: `RISK REJECT: Daily Drawdown Limit Exceeded (${ddPercentage.toFixed(2)}% >= ${limits.maxDailyDrawdownPct}%)`,
    };
  }

  // 3. Margin Level Protection
  const marginLevel = snapshot.margin === 0 ? 1000 : (snapshot.equity / snapshot.margin) * 100;
  if (marginLevel < limits.minMarginLevelPct && snapshot.margin > 0) {
    return { isSafe: false, reason: `RISK REJECT: Margin level too low (${marginLevel.toFixed(1)}%)` };
  }

  // 4. Consecutive Loss Guard
  if (snapshot.consecutiveLosses >= limits.maxConsecutiveLosses) {
    return { isSafe: false, reason: `RISK REJECT: Max consecutive losses hit (${snapshot.consecutiveLosses}). Circuit breaker active.` };
  }

  // 5. Spread Filter
  if (snapshot.currentSpread > limits.maxSpreadLimit) {
    return { isSafe: false, reason: `RISK REJECT: Spread too high (${snapshot.currentSpread} > ${limits.maxSpreadLimit})` };
  }
  
  // 6. Overtrade Filter
  if (snapshot.openPositionsCount >= limits.maxPositions) {
    return { isSafe: false, reason: `RISK REJECT: Max open positions reached (${limits.maxPositions})` };
  }

  return { isSafe: true };
}

export function calculateLotSize(
  balance: number,
  riskPercent: number,
  slDistancePips: number,
  symbol: string = 'XAUUSD'
): number {
  if (slDistancePips <= 0) return 0.01;
  const riskAmount = balance * (riskPercent / 100);
  
  // Dynamic Pip Value (Simplistic estimation, ideally queried from broker specs)
  let pipValue = 10; // XAUUSD standard
  if (symbol.includes("JPY")) pipValue = 8.5; // Roughly
  
  let calculatedLot = riskAmount / (slDistancePips * pipValue);

  // Hard constraints
  if (calculatedLot < 0.01) calculatedLot = 0.01;
  if (calculatedLot > 5.0) calculatedLot = 5.0; // Hard max constraint for safety

  return Math.round(calculatedLot * 100) / 100;
}

