import { useEffect, useState } from "react";
import {
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Settings,
  Ban,
  Wifi,
} from "lucide-react";
import { Card, cn } from "./ui";

export const McpSystemGrid = () => {
  const [data, setData] = useState<{ engines: any[] } | null>(null);

  useEffect(() => {
    const fetchMcp = async () => {
      try {
        const res = await fetch("/api/mcp/status");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {}
    };
    fetchMcp();
    const interval = setInterval(fetchMcp, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!data?.engines)
    return (
      <div className="text-[12px] text-brand-text-sec animate-pulse p-4 text-center">
        Scanning System Engines...
      </div>
    );

  const domains = Array.from(new Set(data.engines.map((e) => e.domain)));

  // Sort domains
  const order = [
    "Market Data",
    "News & Sentiment",
    "SMC",
    "AI",
    "Signal Quality",
    "Risk",
    "Execution",
    "Database",
    "Observability",
    "Infrastructure",
    "Deployment",
    "Backtesting & Research",
  ];
  domains.sort((a, b) => {
    let ia = order.findIndex((o) => a.includes(o));
    let ib = order.findIndex((o) => b.includes(o));
    if (ia === -1) ia = 99;
    if (ib === -1) ib = 99;
    return ia - ib;
  });

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs md:text-sm font-bold uppercase tracking-widest text-brand-text mb-2 flex items-center gap-2">
        <Server className="w-4 h-4 text-brand-accent" />
        Model Context Protocol Registry ({data.engines.length})
      </h3>

      {domains.map((domain) => {
        const engines = data.engines.filter((e) => e.domain === domain);
        return (
          <div key={domain} className="flex flex-col gap-2">
            <h4 className="text-[11px] md:text-xs uppercase font-bold text-brand-text-sec tracking-widest border-b border-brand-border/50 pb-1">
              {domain}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {engines.map((engine) => {
                const isOnline =
                  engine.status === "ONLINE" || engine.status === "READY";
                const isReachable = engine.status === "REACHABLE";
                const isDegraded =
                  engine.status === "DEGRADED" ||
                  engine.status === "WAITING_FOR_TERMINAL";
                const isDisabled =
                  engine.status === "DISABLED" ||
                  engine.status === "NOT_CONFIGURED" ||
                  engine.status === "UNAVAILABLE" ||
                  engine.status === "MISSING_KEY";
                const isError =
                  engine.status === "ERROR" || engine.status === "OFFLINE";

                return (
                  <Card
                    key={engine.id}
                    className={cn(
                      "p-2 border relative overflow-hidden transition-colors rounded-lg",
                      isOnline
                        ? "border-brand-success/20 bg-brand-success/[0.03] hover:border-brand-success/40"
                        : isReachable
                          ? "border-brand-info/20 bg-brand-info/[0.03] hover:border-brand-info/40"
                          : isDegraded
                            ? "border-brand-warning/30 bg-brand-warning/5 hover:border-brand-warning/50"
                            : isDisabled
                              ? "border-brand-border/20 bg-black/20 opacity-70"
                              : "border-brand-danger/30 bg-brand-danger/5 hover:border-brand-danger/50",
                    )}
                  >
                    <div className="flex justify-between items-start mb-0.5">
                      <span
                        className="text-[10px] md:text-[11px] font-bold text-brand-text tracking-widest w-[85%] truncate uppercase pr-1"
                        title={engine.name}
                      >
                        {engine.name}
                      </span>
                      <div className="w-[15%] flex justify-end">
                        {isOnline && (
                          <CheckCircle className="w-3 h-3 text-brand-success" />
                        )}
                        {isReachable && (
                          <Wifi className="w-3 h-3 text-brand-info" />
                        )}
                        {isDisabled && (
                          <Ban className="w-3 h-3 text-brand-text-sec opacity-40" />
                        )}
                        {isDegraded && (
                          <AlertTriangle className="w-3 h-3 text-brand-warning animate-pulse" />
                        )}
                        {isError && (
                          <XCircle className="w-3 h-3 text-brand-danger" />
                        )}
                        {engine.status === "INITIALIZING" && (
                          <Settings className="w-3 h-3 text-brand-info animate-spin" />
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "text-[9px] md:text-[10px] font-mono tracking-widest truncate max-w-full uppercase font-bold",
                        isOnline
                          ? "text-brand-success opacity-80"
                          : isReachable
                            ? "text-brand-info opacity-80"
                            : isDisabled
                              ? "text-brand-text-sec opacity-50"
                              : isError
                                ? "text-brand-danger opacity-80"
                                : "text-brand-warning opacity-80",
                      )}
                    >
                      {engine.status}{" "}
                      <span className="font-sans text-[8px] opacity-40 float-right lowercase mt-0.5">
                        v{engine.version}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
