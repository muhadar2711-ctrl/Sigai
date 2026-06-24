import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card, Badge, cn } from "./ui";
import { ShieldCheck, Activity, Target } from "lucide-react";

export function Signals() {
  const [signals, setSignals] = useState<any[]>([]);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await apiFetch("/signals");
        if (res.data) setSignals(res.data);
      } catch (err) {}
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in pb-10 w-full overflow-hidden">
      <h2 className="text-sm md:text-base font-bold text-brand-text mb-1 flex items-center gap-2">
        <Activity className="w-4 h-4 md:w-5 md:h-5 text-brand-accent" />
        Live Signals History
      </h2>
      {signals.length === 0 ? (
        <Card className="bg-brand-bg-sec/30 border-dashed border-brand-border min-h-[160px] w-full items-center justify-center">
          <div className="flex flex-col items-center justify-center text-brand-text-sec">
            <ShieldCheck className="w-8 h-8 opacity-40 mb-3" />
            <div className="text-xs md:text-sm font-semibold uppercase tracking-widest">
              Awaiting Target Confluence
            </div>
            <div className="text-[10px] md:text-xs mt-1.5 opacity-60 font-mono">
              Live signal activity will populate here.
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {signals
            .filter(
              (s) =>
                s.status !== "REJECTED_BY_AI" && s.status !== "INVALIDATED",
            )
            .map((s) => (
              <Card
                key={s.id}
                className={cn(
                  "border-l-4 p-4 w-full shadow-sm transition-all",
                  s.type === "BUY"
                    ? "border-l-brand-success bg-brand-success/5 border-t border-r border-b border-brand-border/40"
                    : "border-l-brand-danger bg-brand-danger/5 border-t border-r border-b border-brand-border/40",
                  s.status === "PENDING" && "opacity-70",
                )}
              >
                <div className="flex justify-between items-start mb-3 w-full">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <Badge
                        variant={s.type === "BUY" ? "success" : "danger"}
                        className="font-bold text-[10px] md:text-[11px] px-2 py-0.5 rounded-md"
                      >
                        {s.type}
                      </Badge>
                      <span className="text-base md:text-lg font-bold font-mono text-brand-text">
                        {s.symbol}
                      </span>
                    </div>
                    <div
                      className="text-[10px] md:text-xs text-brand-text-sec font-bold whitespace-normal leading-tight tracking-wider uppercase flex items-center gap-1.5"
                      title={s.strategy}
                    >
                      <Target className="w-3.5 h-3.5" />
                      {s.strategy || "SMC AI Strategy"}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <Badge
                      variant={
                        s.status === "ACTIVE"
                          ? "success"
                          : s.status === "TP1_HIT"
                            ? "warning"
                            : ["TP2_HIT", "TP3_HIT"].includes(s.status)
                              ? "success"
                              : [
                                    "SL_HIT",
                                    "REJECTED_BY_AI",
                                    "INVALIDATED",
                                    "EXPIRED",
                                  ].includes(s.status)
                                ? "danger"
                                : s.status === "PENDING"
                                  ? "warning"
                                  : "default"
                      }
                      className="font-bold text-[9px] md:text-[10px] px-2 py-0.5 rounded"
                    >
                      {s.status?.replace("_", " ") || "PENDING"}
                    </Badge>

                    {s.currentPips !== undefined &&
                      [
                        "ACTIVE",
                        "TP1_HIT",
                        "BREAKEVEN",
                        "TP2_HIT",
                        "PENDING",
                      ].includes(s.status) && (
                        <div className="flex flex-col items-end">
                          <div
                            className={cn(
                              "text-sm md:text-base font-mono font-bold mt-1",
                              s.currentPips > 0
                                ? "text-brand-success"
                                : "text-brand-danger",
                            )}
                          >
                            {s.currentPips > 0 ? "+" : ""}
                            {s.currentPips.toFixed(1)} pips
                          </div>
                        </div>
                      )}
                    <span className="text-[10px] md:text-[11px] text-brand-text-sec mt-1.5 font-mono">
                      {new Date(s.timestamp).toLocaleTimeString("id-ID", {
                        timeZone: "Asia/Makassar",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      WITA
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-[1px] mt-4 bg-brand-border/40 rounded-lg overflow-hidden border border-brand-border/30">
                  <div className="text-center bg-brand-bg-sec/90 p-2">
                    <div className="text-[9px] md:text-[10px] text-brand-text-sec font-bold uppercase mb-1">
                      Entry
                    </div>
                    <div className="text-[11px] md:text-xs font-mono font-semibold text-brand-text">
                      {s.entry?.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center bg-brand-bg-sec/90 p-2 border-l border-brand-border/30">
                    <div className="text-[9px] md:text-[10px] text-brand-text-sec font-bold uppercase mb-1">
                      SL
                    </div>
                    <div className="text-[11px] md:text-xs font-mono font-semibold text-brand-danger">
                      {s.sl?.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center bg-brand-bg-sec/90 p-2 border-l border-brand-border/30">
                    <div className="text-[9px] md:text-[10px] text-brand-text-sec font-bold uppercase mb-1">
                      TP1
                    </div>
                    <div className="text-[11px] md:text-xs font-mono font-semibold text-brand-success">
                      {s.tp1?.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center bg-brand-bg-sec/90 p-2 border-l border-brand-border/30">
                    <div className="text-[9px] md:text-[10px] text-brand-text-sec font-bold uppercase mb-1">
                      TP2
                    </div>
                    <div className="text-[11px] md:text-xs font-mono font-semibold text-brand-success">
                      {s.tp2?.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center bg-brand-bg-sec/90 p-2 border-l border-brand-border/30">
                    <div className="text-[9px] md:text-[10px] text-brand-text-sec font-bold uppercase mb-1">
                      TP3
                    </div>
                    <div className="text-[11px] md:text-xs font-mono font-semibold text-brand-success">
                      {s.tp3 ? s.tp3.toFixed(2) : "-"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between sm:items-center mt-4 pt-3 border-t border-brand-border/40 w-full gap-3">
                  <div className="text-[10px] md:text-[11px] text-brand-text flex-1">
                    <span className="font-bold text-brand-text-sec uppercase mb-1 block tracking-wider">
                      AI VERDICT:{" "}
                      <span
                        className={
                          s.ai_verdict === "APPROVED"
                            ? "text-brand-success"
                            : "text-brand-warning"
                        }
                      >
                        {s.ai_verdict}
                      </span>
                    </span>
                    <span className="opacity-80 leading-relaxed block font-medium">
                      {s.ai_reason
                        ? s.ai_reason
                        : "No detailed reason provided."}
                    </span>
                  </div>

                  <div className="flex sm:flex-col gap-2.5 shrink-0">
                    {s.rrRatio && (
                      <div className="text-[11px] font-mono text-brand-info font-bold">
                        RR 1:{s.rrRatio.toFixed(1)}
                      </div>
                    )}
                    <div className="text-[11px] font-mono text-brand-accent font-bold">
                      CONF {s.confidence}%
                    </div>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
