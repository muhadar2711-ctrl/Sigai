import React, { useState, useEffect } from "react";
import {
  Activity,
  Radio,
  BarChart3,
  Settings as SettingsIcon,
  ShieldAlert,
  Cpu,
  Terminal,
  AlertTriangle,
  MessageSquare,
  Zap,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "./ui";
import { Dashboard } from "./Dashboard";
import { Scanner } from "./Scanner";
import { Signals } from "./Signals";
import { Analytics } from "./Analytics";
import { Settings } from "./Settings";
import { Errors } from "./Errors";
import { AIChat } from "./AIChat";
import { AutoTrade } from "./AutoTrade";
import { apiFetch } from "../lib/api";

export function Layout() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [hasErrors, setHasErrors] = useState(false);
  const [livePrice, setLivePrice] = useState<number>(0);
  const [priceTrend, setPriceTrend] = useState<"up" | "down" | "none">("none");

  useEffect(() => {
    const handleAskAi = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) {
        sessionStorage.setItem("sigai_ai_chat_prefill", detail);
      }
      setActiveTab("ai");
    };
    window.addEventListener("ask-ai", handleAskAi as EventListener);

    const checkErrors = async () => {
      try {
        const { data } = await apiFetch("/system/status");
        if (data?.errors && data.errors.length > 0) {
          setHasErrors(true);
        } else {
          setHasErrors(false);
        }

        if (data?.prices?.XAUUSD) {
          setLivePrice((prev) => {
            const cp = data.prices.XAUUSD;
            if (prev > 0) {
              if (cp > prev) setPriceTrend("up");
              else if (cp < prev) setPriceTrend("down");
              else setPriceTrend("none");
            }
            return cp;
          });
        }
      } catch (err) {
        // Silently handle error fetching status for header
      }
    };
    checkErrors();
    const iv = setInterval(checkErrors, 2000);
    return () => {
      clearInterval(iv);
      window.removeEventListener("ask-ai", handleAskAi as EventListener);
    };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "scanner":
        return <Scanner />;
      case "signals":
        return <Signals />;
      case "analytics":
        return <Analytics />;
      case "ai":
        return <AIChat />;
      case "autotrade":
        return <AutoTrade />;
      case "settings":
        return <Settings />;
      case "logs":
        return <Errors />;
      default:
        return (
          <div className="p-4 text-brand-text-sec">
            Module unavailable: {activeTab}
          </div>
        );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-brand-bg flex flex-col font-sans pb-[72px]">
      <header className="h-14 shrink-0 sticky top-0 z-50 bg-brand-bg/95 backdrop-blur-xl border-b border-brand-border px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-accent to-blue-500 flex items-center justify-center shadow-lg">
            <Cpu className="w-3.5 h-3.5 text-white font-black" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-xs font-bold text-white leading-none mb-0.5 tracking-wide">
              XAUUSD AI
            </h1>
            <div className="text-[9px] text-brand-success font-bold uppercase tracking-widest leading-none">
              READY
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          {livePrice > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-brand-border/50 bg-brand-bg-sec/50">
              <span className="text-[9px] font-bold tracking-widest uppercase text-brand-text-sec hidden sm:inline">
                LIVE
              </span>
              <span
                className={cn(
                  "font-mono text-xs font-bold tabular-nums",
                  priceTrend === "up"
                    ? "text-brand-success"
                    : priceTrend === "down"
                      ? "text-brand-danger"
                      : "text-brand-text",
                )}
              >
                {livePrice.toFixed(2)}
              </span>
              {priceTrend === "up" && (
                <TrendingUp className="w-3 h-3 text-brand-success hidden sm:block" />
              )}
              {priceTrend === "down" && (
                <TrendingDown className="w-3 h-3 text-brand-danger hidden sm:block" />
              )}
            </div>
          )}

          <div className="hidden sm:flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-success animate-pulse"></div>
            <span className="text-[9px] font-bold tracking-widest text-brand-text-sec uppercase">
              ONLINE
            </span>
          </div>

          <div className="text-right tabular-nums hidden md:block border-l border-brand-border pl-3">
            <p className="text-[10px] font-bold text-brand-text font-mono">
              {new Date().toLocaleTimeString("id-ID", {
                timeZone: "Asia/Makassar",
              })}{" "}
              WITA
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col gap-4">
        {renderContent()}
      </main>

      <nav className="fixed bottom-0 w-full bg-brand-bg-sec/95 backdrop-blur-xl border-t border-brand-border px-2 py-2 flex justify-around items-center z-50 pb-safe">
        <NavItem
          active={activeTab === "dashboard"}
          onClick={() => setActiveTab("dashboard")}
          icon={<Activity />}
          label="Dash"
        />
        <NavItem
          active={activeTab === "scanner"}
          onClick={() => setActiveTab("scanner")}
          icon={<Radio />}
          label="Scan"
        />
        <NavItem
          active={activeTab === "signals"}
          onClick={() => setActiveTab("signals")}
          icon={<ShieldAlert />}
          label="Signals"
        />
        <NavItem
          active={activeTab === "ai"}
          onClick={() => setActiveTab("ai")}
          icon={<MessageSquare />}
          label="AI Chat"
        />
        <NavItem
          active={activeTab === "autotrade"}
          onClick={() => setActiveTab("autotrade")}
          icon={<Terminal />}
          label="EA Core"
        />
        <NavItem
          active={activeTab === "settings"}
          onClick={() => setActiveTab("settings")}
          icon={<SettingsIcon />}
          label="Settings"
        />
      </nav>
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-1 md:p-2 rounded-xl transition-all min-w-[50px] sm:min-w-[64px]",
        active
          ? "text-brand-accent"
          : "text-brand-text-sec hover:text-brand-text",
      )}
    >
      <div className={cn("w-4 h-4 md:w-5 md:h-5")}>
        {React.cloneElement(icon as any, { strokeWidth: active ? 2.5 : 2 })}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
