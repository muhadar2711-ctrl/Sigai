import React, { useEffect, useState } from "react";
import { Card, Badge, cn } from "./ui";
import { Radar, Eye, Target, Zap, AlertCircle, RefreshCw } from "lucide-react";
import { apiFetch } from "../lib/api";

export function Scanner() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/system/status");
      if (res.success) {
        setData(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const intv = setInterval(fetchStatus, 3000);
    return () => clearInterval(intv);
  }, []);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in h-full overflow-y-auto w-full pb-8">
      <div className="flex items-center justify-between pb-2 border-b border-brand-border/50">
        <h2 className="text-sm md:text-base font-bold tracking-tight text-brand-text flex items-center gap-2 uppercase">
          <Radar className={cn("w-4 h-4 md:w-5 md:h-5 text-brand-accent", loading && "animate-spin")} />
          Live Setup Scanner
        </h2>
        <div className="flex items-center gap-2">
          {data?.killzone && (
            <Badge variant="info" className="text-[10px] hidden sm:inline-flex border-brand-info/30 text-brand-info bg-brand-info/10">
               {data.killzone}
            </Badge>
          )}
          <button
            onClick={fetchStatus}
            className="p-1.5 hover:bg-brand-border rounded text-brand-text-sec transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-brand-accent", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 w-full">
        {data?.strategies && Object.keys(data.strategies).length > 0 ? (
           Object.entries(data.strategies).map(([key, st]: any) => {
              const isReady = st.status === "SIGNAL_READY";
              const isError = st.status === "ERROR";
              const isRunning = st.status === "SCANNING" || st.status === "MONITORING";

              return (
                 <Card
                  key={key}
                  className={cn(
                    "p-3 lg:p-4 flex flex-col h-full transform transition-all duration-300 relative overflow-hidden",
                    isReady
                      ? "border-brand-success/50 bg-brand-success/5 shadow-[0_0_15px_rgba(0,255,148,0.15)]"
                      : "border-brand-border bg-brand-bg-sec/50 hover:bg-brand-bg-sec"
                  )}
                 >
                    {isReady && <div className="absolute -top-6 -right-6 w-12 h-12 bg-brand-success/20 blur-xl rounded-full" />}
                    <div className="flex justify-between items-start mb-3 border-b border-brand-border/40 pb-2">
                       <div className="flex flex-col gap-0.5 max-w-[80%]">
                          <h3 className="text-[11px] md:text-xs font-black uppercase text-brand-text tracking-widest break-words leading-tight">
                             {st.name || key}
                          </h3>
                       </div>
                       <Badge variant={isReady ? "success" : isError ? "danger" : isRunning ? "warning" : "default"} className="text-[9px] px-1.5 py-0">
                         {st.status || "IDLE"}
                       </Badge>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-grow">
                       {st.setupState && Object.keys(st.setupState).filter((sk) => sk !== "entryValidity" && typeof st.setupState[sk] !== "object").sort((a,b) => {
                          const mA = a.match(/^step(\d+)/);
                          const mB = b.match(/^step(\d+)/);
                          if (mA && mB) return parseInt(mA[1]) - parseInt(mB[1]);
                          return a.localeCompare(b);
                       }).map((sk) => {
                          const sv = st.setupState[sk];
                          const isRejected = String(sv).includes("REJECT") || String(sv).includes("FAILED") || sv === "NONE" || sv === "NO" || String(sv).includes("MISMATCH") || String(sv).includes("INVALID") || String(sv).includes("OUTSIDE");
                          const isAwaiting = String(sv).includes("AWAITING");
                          const isApproved = !isAwaiting && !isRejected && sv !== false;
                          const cleanName = sk.replace(/^step\d+_/, "").replace(/([A-Z])/g, " $1").trim();
                          
                          return (
                             <div key={sk} className={cn(
                                "flex items-center justify-between px-2 py-1.5 border-l-[3px] rounded transition-colors w-full gap-2",
                                isApproved ? "border-brand-success bg-brand-success/5 text-brand-success" : 
                                isRejected ? "border-brand-danger bg-brand-danger/5 text-brand-danger" :
                                "border-brand-border/40 bg-black/10 text-brand-text-sec"
                             )}>
                                <span className={cn(
                                   "text-[9px] font-bold tracking-widest uppercase leading-tight truncate",
                                   isApproved ? "text-brand-success" : isRejected ? "text-brand-danger" : "text-brand-text-sec"
                                )}>
                                   {cleanName}
                                </span>
                                <span className={cn(
                                   "text-[9px] font-mono tracking-widest text-right uppercase font-bold text-ellipsis overflow-hidden whitespace-nowrap min-w-[30%]", 
                                   isApproved ? "text-brand-success" : isRejected ? "text-brand-danger" : "text-brand-text-sec/60"
                                )} title={String(sv)}>
                                   {String(sv)}
                                </span>
                             </div>
                          )
                       })}
                    </div>

                    {st.debugAudit?.lastReasonRejected && !isReady && (
                       <div className="mt-3 pt-2 border-t border-brand-border/30">
                           <div className="p-1.5 bg-brand-danger/5 border border-brand-danger/10 rounded">
                              <p className="text-[9px] font-mono text-brand-text-sec flex flex-col gap-0.5">
                                 <span className="font-bold text-brand-danger/70 flex items-center gap-1 uppercase tracking-widest"><AlertCircle className="w-2.5 h-2.5"/> Filtered</span>
                                 <span className="uppercase tracking-widest text-[8px] pl-3.5 leading-tight">{st.debugAudit.lastReasonRejected}</span>
                              </p>
                           </div>
                       </div>
                    )}
                 </Card>
              )
           })
        ) : (
           <div className="col-span-full py-10 flex flex-col items-center justify-center border border-brand-border/50 rounded-xl bg-brand-bg-sec/50 border-dashed">
              <Eye className="w-8 h-8 text-brand-text-sec/40 mb-3" />
              <p className="text-xs uppercase tracking-widest text-brand-text-sec/60 font-bold">Waiting for system init...</p>
           </div>
        )}
      </div>
    </div>
  );
}

