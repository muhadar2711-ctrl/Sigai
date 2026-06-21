import React, { useEffect, useState } from "react";
import {
  Activity,
  Zap,
  AlertTriangle,
  ActivitySquare,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";
import { Badge, Card, cn } from "./ui";
import { apiFetch } from "../lib/api";

export function Dashboard() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const { data } = await apiFetch("/system/status");
        if (data) setStatus(data);
      } catch (err) {}
    };
    loadStatus();
    const iv = setInterval(loadStatus, 3000);
    return () => clearInterval(iv);
  }, []);

  const latest = status?.signalsHistory?.[0];

  return (
    <div className="flex flex-col gap-5 flex-1 w-full animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-2 items-center bg-brand-bg-sec/50 p-2.5 rounded-xl border border-brand-border shadow-sm">
        <Badge
          variant={
            status?.autotrade?.tradeMode === "AUTO" ? "success" : "warning"
          }
          className="font-mono text-[9px] px-1.5 py-0.5 rounded-md uppercase"
        >
          {status?.autotrade?.tradeMode || "MANUAL"} MODE
        </Badge>
        <Badge
          variant={
            status?.autotrade?.executionProvider === "NONE"
              ? "warning"
              : "success"
          }
          className="font-mono text-[9px] px-1.5 py-0.5 rounded-md uppercase"
        >
          EXEC: {status?.autotrade?.executionProvider || "NONE"}
        </Badge>
        <Badge
          variant={
            status?.connections?.metaapi === "ONLINE" ? "success" : "default"
          }
          className="font-mono text-[9px] px-1.5 py-0.5 rounded-md uppercase"
        >
          EXEC: {status?.connections?.metaapi === "ONLINE" ? "METAAPI_ON" : "STANDBY"}
        </Badge>
        {status?.robotStatus === "ON" &&
          status?.autotrade?.tradeMode === "AUTO" && (
            <Badge
              variant="accent"
              className="font-mono text-[9px] animate-pulse px-1.5 py-0.5 rounded-md uppercase"
            >
              EXEC_ARMED
            </Badge>
          )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          className={cn(
            "h-20 flex flex-col justify-between p-3.5 shadow-sm transition-all duration-300",
            status?.engineMode === "NEWS"
              ? "border-brand-warning/40 bg-brand-warning/5"
              : "border-brand-success/20 hover:border-brand-success/40"
          )}
        >
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 opacity-90">
              Risk Mode
            </div>
            <ActivitySquare className="w-3.5 h-3.5 opacity-70 text-brand-accent object-contain" />
          </div>
          <div
            className={cn(
              "text-sm font-bold font-mono truncate tracking-wide",
              status?.engineMode === "NEWS"
                ? "text-brand-warning"
                : "text-brand-success"
            )}
          >
            {status?.engineMode || "STANDARD"}
          </div>
        </Card>

        <Card
          className={cn(
            "h-20 flex flex-col justify-between p-3.5 shadow-sm transition-all duration-500",
            status?.robotStatus === "ON"
              ? "border-brand-success/50 bg-brand-success/5 animate-pulse"
              : "border-brand-border/60 hover:border-brand-accent/30"
          )}
        >
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 opacity-90">
              Engine State
            </div>
            {status?.robotStatus === "ON" ? (
              <Zap className="w-3.5 h-3.5 text-brand-success drop-shadow-[0_0_8px_rgba(0,255,148,0.8)]" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-brand-danger" />
            )}
          </div>
          <div
            className={cn(
              "text-sm font-bold font-mono truncate tracking-wide",
              status?.robotStatus === "ON"
                ? "text-brand-success"
                : status?.robotStatus === "PAUSE"
                  ? "text-brand-warning"
                  : "text-brand-danger"
            )}
          >
            {status?.robotStatus || "OFF"}
          </div>
        </Card>

        <Card className="h-20 flex flex-col justify-between p-3.5 border-brand-border/60 shadow-sm transition-all hover:border-brand-accent/40 group">
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 group-hover:text-brand-text transition-colors opacity-90">
              XAUUSD Live
            </div>
            <Activity className="w-3.5 h-3.5 text-brand-accent opacity-70 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-brand-text text-sm font-bold font-mono truncate tracking-wide">
            {status?.prices?.XAUUSD ? status.prices.XAUUSD.toFixed(2) : "0.00"}
          </div>
        </Card>

        <Card className="h-20 flex flex-col justify-between p-3.5 border-brand-border/60 shadow-sm transition-all hover:border-brand-info/40 group">
          <div className="flex justify-between items-center text-brand-text-sec">
            <div className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 group-hover:text-brand-text transition-colors opacity-90">
              EURUSD Live
            </div>
            <Activity className="w-3.5 h-3.5 text-brand-info opacity-70 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-brand-text text-sm font-bold font-mono truncate tracking-wide">
            {status?.prices?.EURUSD ? status.prices.EURUSD.toFixed(5) : "0.00000"}
          </div>
        </Card>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-brand-text flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-info" /> Latest Signal
          Execution
        </h3>

        {latest ? (
          <Card
            className={cn(
              "p-4 border shadow-sm transition-colors duration-300",
              latest.type === "BUY"
                ? "border-brand-success/30 bg-brand-success/5"
                : "border-brand-danger/30 bg-brand-danger/5",
            )}
          >
            <div className="flex justify-between items-start mb-3 w-full">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <Badge
                    variant={latest.type === "BUY" ? "success" : "danger"}
                    className="font-bold text-[10px] px-2 py-0.5 rounded"
                  >
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
                  <BrainCircuit className="w-3.5 h-3.5 text-brand-accent" /> AI
                  Verified &bull;{" "}
                  {new Date(latest.timestamp).toLocaleTimeString("id-ID", {
                    timeZone: "Asia/Makassar",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  WITA
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant={
                    latest.ai_verdict === "APPROVED" ? "accent" : "warning"
                  }
                  className="font-semibold text-[10px] px-2 py-0.5 rounded"
                >
                  {latest.ai_verdict === "APPROVED"
                    ? "VERIFIED"
                    : latest.ai_verdict === "NEED_MORE_CONFIRMATION"
                      ? "AWAITING"
                      : "REJECTED"}
                </Badge>
                {latest.currentPips !== undefined &&
                  [
                    "ACTIVE",
                    "TP1_HIT",
                    "BREAKEVEN",
                    "TP2_HIT",
                    "PENDING",
                  ].includes(latest.status) && (
                    <div
                      className={cn(
                        "text-sm font-mono font-bold",
                        latest.currentPips > 0
                          ? "text-brand-success"
                          : "text-brand-danger",
                      )}
                    >
                      {latest.currentPips > 0 ? "+" : ""}
                      {latest.currentPips.toFixed(1)} pips
                    </div>
                  )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-[1px] mt-2 bg-brand-border/40 rounded overflow-hidden">
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] md:text-[10px] text-brand-text-sec font-semibold uppercase tracking-wider mb-1">
                  Entry
                </span>
                <span className="text-xs md:text-sm font-mono font-semibold text-brand-text">
                  {latest.entry?.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] md:text-[10px] text-brand-text-sec font-semibold uppercase tracking-wider mb-1">
                  SL
                </span>
                <span className="text-xs md:text-sm font-mono font-semibold text-brand-danger">
                  {latest.sl?.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] md:text-[10px] text-brand-text-sec font-semibold uppercase tracking-wider mb-1">
                  TP
                </span>
                <span className="text-xs md:text-sm font-mono font-semibold text-brand-success">
                  {latest.tp2?.toFixed(2) || latest.tp1?.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col bg-brand-bg-sec/80 p-2 text-center">
                <span className="text-[9px] md:text-[10px] text-brand-text-sec font-semibold uppercase tracking-wider mb-1">
                  RR
                </span>
                <span className="text-xs md:text-sm font-mono font-semibold text-brand-info">
                  1:{latest.rrRatio ? latest.rrRatio.toFixed(1) : "-"}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-brand-border/30 w-full">
              <div className="text-[10px] md:text-xs text-brand-text-sec">
                <span className="font-semibold uppercase mr-2 tracking-wider">
                  State:
                </span>
                <span
                  className={cn(
                    "font-bold",
                    latest.status === "SL_HIT"
                      ? "text-brand-danger"
                      : latest.status === "CLOSED"
                        ? "text-brand-success"
                        : "text-brand-text",
                  )}
                >
                  {latest.status?.replace("_", " ")}
                </span>
              </div>
              <div className="text-[10px] md:text-xs uppercase font-bold text-brand-text-sec bg-brand-bg px-2.5 py-1 rounded-md border border-brand-border shadow-sm">
                AI Score:{" "}
                <span className="text-brand-success ml-1">
                  {latest.confidence}%
                </span>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="min-h-[100px] flex items-center justify-center p-4 bg-brand-bg-sec/30 border-dashed border-brand-border mt-1 transition-all">
            <div className="flex flex-col items-center text-brand-text-sec">
              <ShieldCheck className="w-5 h-5 mb-2 opacity-50 text-brand-accent transition-all duration-1000 animate-pulse" />
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
                Grid is Clear
              </div>
              <div className="text-[9px] font-mono opacity-60">
                Awaiting matrix computations...
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
