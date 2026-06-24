tsx
import React, { useEffect, useState } from "react";
import {
  Activity,
  Zap,
  ShieldAlert,
  ActivitySquare,
  BrainCircuit,
  ShieldCheck,
  Target,
  ChevronRight,
  Database,
  Search,
  ClipboardCheck,
  Layers,
  BarChart3,
} from "lucide-react";
import { Badge, Card, cn } from "./ui";
import { apiFetch } from "../lib/api";

const getStepColor = (status: string) => {
  switch (status?.toUpperCase()) {
    case "VALIDATED":
    case "APPROVED":
      return "text-brand-success border-brand-success/30 bg-brand-success/10";
    case "ACTIVE":
      return "text-brand-info border-brand-info/30 bg-brand-info/10 animate-pulse";
    case "REJECTED":
      return "text-brand-danger border-brand-danger/30 bg-brand-danger/10";
    case "EXPIRED":
      return "text-brand-warning border-brand-warning/30 bg-brand-warning/10";
    case "AWAITING":
    default:
      return "text-brand-text-sec border-brand-border/40 bg-black/20 opacity-50";
  }
};

export function Dashboard() {
  const [status, setStatus] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const loadStatus = async () => {
    try {
      const { data } = await apiFetch("/system/status");
      if (data) setStatus(data);
    } catch (err) {}
  };

  useEffect(() => {
    loadStatus();
    const iv = setInterval(loadStatus, 3000);
    return () => clearInterval(iv);
  }, []);

  const triggerWalkforward = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/walkforward/test", {
        method: "POST",
        body: JSON.stringify({ symbol: "XAUUSD" }),
      });
      if (res?.data) setTestResult(res.data);
    } catch (err) {
      console.error("Walkforward Error:", err);
    } finally {
      setIsTesting(false);
    }
  };

  const latest = status?.signalsHistory?.[0];
  const strategies = status?.strategies ? Object.entries(status.strategies) : [];

  return (
    <div className="flex flex-col gap-5 flex-1 w-full animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-2 items-center justify-between bg-brand-bg-sec/50 p-2.5 rounded-xl border border-brand-border shadow-sm">
        <div className="flex gap-2">
          <Badge
            variant={status?.autotrade?.tradeMode === "AUTO" ? "success" : "warning"}
            className="font-mono text-[9px] px-1.5 py-0.5 rounded-md uppercase"
          >
            {status?.autotrade?.tradeMode || "MANUAL"} MODE
          </Badge>
          <Badge
            variant={status?.autotrade?.executionProvider === "NONE" ? "warning" : "success"}
            className="font-mono text-[9px] px-1.5 py-0.5 rounded-md uppercase"
          >
            EXEC: {status?.autotrade?.executionProvider || "NONE"}
          </Badge>
          <Badge
            variant={status?.robotStatus === "ON" ? "success" : "danger"}
            className="font-mono text-[9px] px-1.5 py-0.5 rounded-md uppercase"
          >
            SYS: {status?.robotStatus || "OFF"}
          </Badge>
        </div>
        
        <button
          onClick={triggerWalkforward}
          disabled={isTesting}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-accent/10 border border-brand-accent/40 rounded-lg text-[10px] font-bold text-brand-accent uppercase tracking-widest hover:bg-brand-accent/20 transition-all disabled:opacity-50"
        >
          {isTesting ? <Activity className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
          {isTesting ? "Auditing Systems..." : "Trigger Walkforward Test"}
        </button>
      </div>

      {testResult && (
        <Card className={cn(
          "p-4 border shadow-md animate-in slide-in-from-top duration-500",
          testResult.status === "APPROVED" ? "border-brand-success/40 bg-brand-success/5" : 
          testResult.status === "WAIT" ? "border-brand-warning/40 bg-brand-warning/5" : 
          "border-brand-danger/40 bg-brand-danger/5"
        )}>
          <div className="flex items-center justify-between mb-4 border-b border-brand-border/30 pb-3">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-text flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-brand-accent" /> 
              Real-Time Audit: {testResult.symbol}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono opacity-60">VERDICT:</span>
              <Badge variant={testResult.status === "APPROVED" ? "success" : testResult.status === "WAIT" ? "warning" : "danger"} className="flex items-center gap-1 px-2">
                {testResult.status === "APPROVED" ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                {testResult.status}
              </Badge>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 col-span-1">
              <div className="text-[9px] font-bold text-brand-text-sec uppercase flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3" /> Evidence Found
              </div>
              <div className="bg-black/40 p-3 rounded-lg border border-brand-border/40 font-mono text-[10px] space-y-1.5 text-brand-text-sec">
                {testResult.evidence ? Object.entries(testResult.evidence).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex justify-between border-b border-brand-border/10 pb-1">
                    <span className="opacity-70">{k.replace(/_/g, " ").toUpperCase()}:</span>
                    <span className="text-brand-text font-bold">
                      {typeof v === 'number' ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : v}
                    </span>
                  </div>
                )) : <div className="text-brand-danger italic">NO_LIVE_DATA_FEED</div>}
              </div>
            </div>
            
            <div className="space-y-2 col-span-2">
              <div className="text-[9px] font-bold text-brand-text-sec uppercase flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Audit Trace & Deterministic Reasoning
              </div>
              <div className="bg-black/20 p-3 rounded-lg border border-brand-border/20 h-full">
                <p className="text-[11px] leading-relaxed text-brand-text font-medium opacity-90">
                  {testResult.reason || "Context acquisition in progress. Waiting for valid OHLC synchronization."}
                </p>
                <div className="mt-4 pt-3 border-t border-brand-border/30 flex justify-between items-center text-[9px] font-mono text-brand-text-sec">
                  <span>Audit Trail Ref: {testResult.id || Date.now()}</span>
                  <span className="text-brand-accent">
                    Verdict reached based on {testResult.evidence ? Object.keys(testResult.evidence).length : 0} evidence points
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={cn("h-20 flex flex-col justify-between p-3.5 shadow-sm transition-all", status?.engineMode === "NEWS" ? "border-brand-warning/40 bg-brand-warning/5" : "border-brand-success/20 hover:border-brand-success/40")}>
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 opacity-90">Risk Mode</div>
            <ActivitySquare className="w-3.5 h-3.5 opacity-70 text-brand-accent" />
          </div>
          <div className={cn("text-sm font-bold font-mono truncate tracking-wide", status?.engineMode === "NEWS" ? "text-brand-warning" : "text-brand-success")}>
            {status?.engineMode || "ANALYZING..."}
          </div>
        </Card>

        <Card className="h-20 flex flex-col justify-between p-3.5 border-brand-border/60 shadow-sm transition-all hover:border-brand-accent/40 group">
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 opacity-90">XAUUSD Live</div>
            <Activity className="w-3.5 h-3.5 text-brand-accent opacity-70" />
          </div>
          <div className="text-brand-text text-sm font-bold font-mono truncate tracking-wide">
            {status?.prices?.XAUUSD ? status.prices.XAUUSD.toFixed(2) : "SYNCING..."}
          </div>
        </Card>

        <Card className="h-20 flex flex-col justify-between p-3.5 border-brand-border/60 shadow-sm transition-all hover:border-brand-info/40 group">
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 opacity-90">EURUSD Live</div>
            <Activity className="w-3.5 h-3.5 text-brand-info opacity-70" />
          </div>
          <div className="text-brand-text text-sm font-bold font-mono truncate tracking-wide">
            {status?.prices?.EURUSD ? status.prices.EURUSD.toFixed(5) : "SYNCING..."}
          </div>
        </Card>

        <Card className="h-20 flex flex-col justify-between p-3.5 border-brand-border/60 shadow-sm transition-all hover:border-brand-accent/40 group">
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 opacity-90">Account</div>
            <Search className="w-3.5 h-3.5 text-brand-accent opacity-70" />
          </div>
          <div className="text-brand-text text-sm font-bold font-mono truncate tracking-wide uppercase">
            {status?.robotStatus === "ON" ? "CONNECTED" : "OFFLINE"}
          </div>
        </Card>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-brand-text flex items-center gap-2 uppercase tracking-widest">
          <Target className="w-4 h-4 text-brand-accent" /> Market Intelligence Matrix
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {strategies.length > 0 ? (
            strategies.map(([id, strat]: [string, any]) => (
              <Card key={id} className="p-4 bg-brand-bg-sec/40 border-brand-border/60">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-[10px] font-bold text-brand-accent uppercase tracking-tighter">{strat.name}</div>
                  <Badge className="text-[8px] font-mono py-0 uppercase">{strat.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {strat.setupState && Object.entries(strat.setupState).map(([stepKey, stepStatus]: [string, any], idx) => (
                    <React.Fragment key={stepKey}>
                      <div className={cn("text-[9px] px-2 py-1 rounded border font-mono font-bold transition-all duration-500", getStepColor(stepStatus))}>
                        {stepKey.replace(/step\d+_/, "").replace(/_/g, " ")}
                      </div>
                      {idx < Object.entries(strat.setupState).length - 1 && (
                        <ChevronRight className="w-3 h-3 text-brand-border opacity-50" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </Card>
            ))
          ) : (
            <div className="col-span-full p-6 text-center text-[10px] font-mono text-brand-text-sec border border-dashed border-brand-border rounded-lg">
              INITIALIZING STRATEGY PIPELINE...
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-brand-text flex items-center gap-2 uppercase tracking-widest">
          <Activity className="w-4 h-4 text-brand-info" /> Latest Execution Trace
        </h3>

        {latest ? (
          <Card className={cn("p-4 border shadow-sm transition-colors duration-300", latest.type === "BUY" ? "border-brand-success/30 bg-brand-success/5" : "border-brand-danger/30 bg-brand-danger/5")}>
            <div className="flex justify-between items-start mb-3 w-full">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <Badge variant={latest.type === "BUY" ? "success" : "danger"} className="font-bold text-[10px] px-2 py-0.5 rounded">
                    {latest.type}
                  </Badge>
                  <span className="text-base font-bold font-mono text-brand-text flex items-center gap-2">
                    {latest.symbol}
                    {latest.status === "ACTIVE" && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-success"></span>
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-[10px] md:text-xs text-brand-text-sec font-medium flex items-center gap-1.5 mt-0.5">
                  <BrainCircuit className="w-3.5 h-3.5 text-brand-accent" /> {latest.ai_verdict === "APPROVED" ? "Verified Evidence" : "Audit Pending"} &bull; {new Date(latest.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WITA
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <Badge variant={latest.ai_verdict === "APPROVED" ? "accent" : "warning"} className="font-semibold text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                  {latest.ai_verdict === "APPROVED" ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                  {latest.ai_verdict}
                </Badge>
                {latest.currentPips !== undefined && (
                  <div className={cn("text-sm font-mono font-bold", latest.currentPips > 0 ? "text-brand-success" : "text-brand-danger")}>
                    {latest.currentPips > 0 ? "+" : ""}{latest.currentPips.toFixed(1)} pips
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-[1px] mt-2 bg-brand-border/40 rounded overflow-hidden">
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] text-brand-text-sec font-semibold uppercase mb-1">Entry</span>
                <span className="text-xs font-mono text-brand-text">{latest.entry?.toFixed(2)}</span>
              </div>
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] text-brand-text-sec font-semibold uppercase mb-1">SL</span>
                <span className="text-xs font-mono text-brand-danger">{latest.sl?.toFixed(2)}</span>
              </div>
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] text-brand-text-sec font-semibold uppercase mb-1">TP</span>
                <span className="text-xs font-mono text-brand-success">{latest.tp1?.toFixed(2)}</span>
              </div>
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] text-brand-text-sec font-semibold uppercase mb-1">RR</span>
                <span className="text-xs font-mono text-brand-info">1:{latest.rrRatio?.toFixed(1) || "-"}</span>
              </div>
            </div>

            <div className="flex justify-between items-center mt-4 pt-3 border-t border-brand-border/30 w-full">
              <div className="text-[9px] font-mono text-brand-text-sec flex items-center gap-1.5 truncate">
                <Database className="w-3 h-3" />
                IDEMPOTENCY_KEY: {latest.id || "NULL_ID"}
              </div>
              <div className="text-[10px] uppercase font-bold text-brand-text-sec bg-brand-bg px-2.5 py-1 rounded border border-brand-border">
                AI CONFIDENCE: <span className="text-brand-success ml-1">{latest.confidence}%</span>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="min-h-[100px] flex items-center justify-center p-4 bg-brand-bg-sec/30 border-dashed border-brand-border mt-1">
            <div className="flex flex-col items-center text-brand-text-sec">
              <ShieldCheck className="w-5 h-5 mb-2 opacity-50 text-brand-accent animate-pulse" />
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Execution Pipeline Idle</div>
              <div className="text-[9px] font-mono opacity-60">Monitoring real-time market liquidity...</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}