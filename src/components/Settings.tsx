import React, { useState, useEffect } from "react";
import { Card, Badge, cn } from "./ui";
import {
  ChevronDown,
  HardDrive,
  Smartphone,
  Shield,
  Bell,
  Network,
  Settings as SettingsIcon,
  Monitor,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { McpSystemGrid } from "./McpSystemGrid";

export function Settings() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [atrNewsThreshold, setAtrNewsThreshold] = useState<number>(2.5);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackDisabled, setRollbackDisabled] = useState(false);
  const [connections, setConnections] = useState<any>({});
  const [robotStatus, setRobotStatus] = useState<string>("OFF");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data } = await apiFetch("/system/status");
        if (data?.settings?.atrThreshold) {
          setAtrNewsThreshold(data.settings.atrThreshold);
        }
        if (data?.connections) {
          setConnections(data.connections);
        }
        if (data) {
          setRobotStatus(data.robotStatus || "OFF");
        }
      } catch (err) {}
    };
    loadSettings();
  }, []);

  const handleRobotStatusChange = async (status: string) => {
    setRobotStatus(status);
    try {
      await apiFetch("/system/robot", {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    } catch (err) {}
  };

  const handleAtrChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAtrNewsThreshold(val);
    try {
      await apiFetch("/system/settings", {
        method: "POST",
        body: JSON.stringify({ atrThreshold: val }),
      });
    } catch (err) {}
  };

  const toggle = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const handleRollback = async () => {
    if (
      !window.confirm("Yakin? Ini akan reset kode ke commit sebelum AI edit.")
    )
      return;

    setRollbackLoading(true);
    try {
      const res = await apiFetch("/ai/rollback", { method: "POST" });
      if (res.success) {
        alert("Rollback success. Railway redeploying...");
        setRollbackDisabled(true);
        setTimeout(() => setRollbackDisabled(false), 30000);
      } else {
        alert("Rollback failed: " + res.message);
      }
    } catch (err) {
      alert("Error calling rollback endpoint.");
    } finally {
      setRollbackLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 md:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h2 className="text-[11px] md:text-sm font-semibold text-brand-text mb-1 md:mb-2 block">
        Configurations
      </h2>

      <AccordionItem
        id="general"
        title="General"
        icon={
          <SettingsIcon className="w-3 h-3 md:w-4 md:h-4 text-brand-text-sec" />
        }
        isOpen={openSection === "general"}
        onToggle={() => toggle("general")}
      >
        <div className="space-y-2 md:space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[9px] md:text-xs text-brand-text-sec">
              Timezone
            </span>
            <Badge
              variant="default"
              className="text-[8px] md:text-[10px] px-1 md:px-2 py-0"
            >
              Asia/Makassar
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] md:text-xs text-brand-text-sec">
              Base Currency
            </span>
            <span className="text-[9px] md:text-xs font-bold text-brand-text">
              USD
            </span>
          </div>
        </div>
      </AccordionItem>

      <AccordionItem
        id="trading"
        title="Trading & Robot"
        icon={<Monitor className="w-3 h-3 md:w-4 md:h-4 text-brand-text-sec" />}
        isOpen={openSection === "trading"}
        onToggle={() => toggle("trading")}
      >
        <div className="space-y-3 md:space-y-4">
          <div className="flex flex-col gap-1 md:gap-1.5 pb-2 md:pb-3 border-b border-brand-border/50">
            <div className="flex items-center justify-between">
              <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-brand-text-sec">
                Matrix State
              </span>
              <div className="flex items-center gap-1 md:gap-1.5 flex-wrap justify-end">
                {["ON", "OFF", "PAUSE", "EMERGENCY_STOP"].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleRobotStatusChange(s)}
                    className={cn(
                      "px-1.5 md:px-2 py-0.5 md:py-1 text-[8px] md:text-[10px] font-bold rounded uppercase transition-colors tracking-wide",
                      robotStatus === s
                        ? s === "ON"
                          ? "bg-brand-success text-brand-bg shadow-[0_0_8px_rgba(0,255,148,0.5)]"
                          : s === "EMERGENCY_STOP"
                            ? "bg-brand-danger text-white shadow-[0_0_8px_rgba(255,51,102,0.5)]"
                            : "bg-brand-text text-brand-bg"
                        : "bg-brand-bg-sec text-brand-text-sec hover:bg-brand-border",
                    )}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[8px] md:text-[10px] text-brand-text-sec mt-1 leading-relaxed">
              Select ON to actively push signals to Telegram, DB, and MT5
              Auto-Trade (if configured). Select EMERGENCY STOP to completely
              abort operations.
            </span>
          </div>

          <div className="flex flex-col gap-1 md:gap-1.5 pb-1 md:pb-2 border-brand-border/50">
            <div className="flex justify-between items-center">
              <span className="text-[9px] md:text-xs font-bold tracking-widest uppercase text-brand-text-sec">
                News Spike Sensor
              </span>
              <span className="text-[10px] md:text-xs font-mono font-bold text-brand-success drop-shadow-[0_0_5px_rgba(0,255,148,0.3)]">
                {atrNewsThreshold.toFixed(1)}x ATR
              </span>
            </div>
            <input
              type="range"
              min="1.5"
              max="4.0"
              step="0.1"
              value={atrNewsThreshold}
              onChange={handleAtrChange}
              className="w-full h-1 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-accent mt-1 md:mt-2"
            />
            <span className="text-[8px] md:text-[10px] text-brand-text-sec mt-1">
              Controls the volatility spike trigger required during News Mode
              for XAUUSD M5.
            </span>
          </div>
        </div>
      </AccordionItem>

      <AccordionItem
        id="mcp_registry"
        title="MCP Enterprise Registry (Tier 1-5)"
        icon={
          <Activity className="w-3 h-3 md:w-4 md:h-4 text-brand-text-sec" />
        }
        isOpen={openSection === "mcp_registry"}
        onToggle={() => toggle("mcp_registry")}
      >
        <McpSystemGrid />
      </AccordionItem>

      <h2 className="text-[11px] md:text-sm font-semibold text-[#DC2626] mt-3 md:mt-4 mb-0.5 flex items-center gap-1.5 md:gap-2 drop-shadow-[0_0_8px_rgba(220,38,38,0.5)]">
        <AlertTriangle className="w-3 h-3 md:w-4 md:h-4" />
        Emergency Tools
      </h2>
      <Card className="border-[#DC2626]/50 bg-[#DC2626]/5 flex flex-col gap-2 md:gap-3 p-3 md:p-4">
        <div>
          <h3 className="text-[10px] md:text-sm font-bold text-[#DC2626] mb-0.5 tracking-tight">
            🚨 Emergency Rollback
          </h3>
          <p className="text-[8px] md:text-xs text-brand-text-sec">
            Return to previous code state if app crashes after AI commit.
          </p>
        </div>
        <button
          onClick={handleRollback}
          disabled={rollbackLoading || rollbackDisabled}
          className="w-full bg-[#DC2626] text-white font-bold text-[9px] md:text-xs py-1.5 md:py-2.5 rounded-lg border border-[#DC2626] hover:bg-[#DC2626]/80 hover:shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all disabled:opacity-50 disabled:hover:shadow-none flex items-center justify-center gap-1.5 md:gap-2 uppercase tracking-wide"
        >
          {rollbackLoading ? (
            <span className="flex items-center gap-1.5 md:gap-2">
              <div className="w-2 h-2 md:w-3 md:h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ROLLBACKING...
            </span>
          ) : (
            "ROLLBACK NOW"
          )}
        </button>
      </Card>
    </div>
  );
}

function AccordionItem({ id, title, icon, isOpen, onToggle, children }: any) {
  return (
    <Card className="p-0 overflow-hidden bg-gradient-to-br from-brand-bg-sec/80 to-brand-bg/80 backdrop-blur-md border hover:border-brand-info/40 transition-all duration-300 group">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 md:p-4 text-[10px] md:text-[13px] font-black tracking-widest uppercase text-brand-text hover:bg-black/20 transition-all duration-300"
      >
        <div className="flex items-center gap-2 md:gap-3 drop-shadow-sm">
          {icon}
          {title}
        </div>
        <ChevronDown
          className={cn(
            "w-3 h-3 md:w-4 md:h-4 text-brand-info transition-transform duration-300 group-hover:scale-125",
            isOpen && "rotate-180 drop-shadow-[0_0_5px_rgba(0,191,255,0.8)]",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="p-2 md:p-4 pt-1 md:pt-1 border-t border-brand-border/40 mt-0.5 md:mt-1 relative z-10">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}
