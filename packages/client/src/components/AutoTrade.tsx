import React, { useState, useEffect } from "react";
import { Terminal, Shield, RefreshCcw, Activity } from "lucide-react";
import { cn } from "./ui";
import { apiFetch } from "../lib/api";

export function AutoTrade() {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data } = await apiFetch("/system/status");
        if (data && data.autotrade) {
          setConfig(data.autotrade);
        }
      } catch (err) {
        console.error("Failed to fetch autotrade config");
      }
    };
    loadConfig();
    const iv = setInterval(loadConfig, 10000);
    return () => clearInterval(iv);
  }, []);

  const updateConfig = async (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    setLoading(true);
    try {
      await apiFetch("/system/autotrade", {
        method: "POST",
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      console.error("Failed to update", err);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in w-full pb-10">
      <div className="flex items-center justify-between pb-2 border-b border-brand-border/50">
        <h2 className="text-sm font-bold text-brand-text flex items-center gap-2 tracking-widest uppercase">
          <Terminal className="text-brand-accent w-4 h-4" /> Auto Trade EA
        </h2>
        {loading && (
          <RefreshCcw className="w-3.5 h-3.5 animate-spin text-brand-text-sec" />
        )}
      </div>

      <div className="bg-brand-bg-sec/30 border border-brand-border/60 rounded-xl p-4 flex flex-col gap-5 backdrop-blur-md shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-brand-border/40">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-bold text-brand-text text-xs uppercase tracking-widest flex items-center gap-2">
              Master Engine Switch
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shadow-sm",
                  config.enabled ? "bg-brand-success shadow-brand-success/50" : "bg-brand-danger shadow-brand-danger/50",
                )}
              />
            </h3>
            <p className="text-[10px] text-brand-text-sec">
              Enable Bridge / Broker Sync
            </p>
          </div>
          <button
            onClick={() => updateConfig("enabled", !config.enabled)}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shadow-inner",
              config.enabled ? "bg-brand-success" : "bg-brand-border",
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                config.enabled ? "translate-x-5" : "translate-x-1",
              )}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-3 border-b border-brand-border/40 w-full">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-sec opacity-80">
              Trade Mode
            </label>
            <select
              value={config.tradeMode || "MANUAL"}
              onChange={(e) => updateConfig("tradeMode", e.target.value)}
              className="bg-black/20 border border-brand-border/60 rounded-lg px-3 py-2 text-[11px] font-bold text-brand-text focus:outline-none focus:border-brand-accent transition-colors font-mono uppercase tracking-wide cursor-pointer"
            >
              <option value="MANUAL">MANUAL (Signals Only)</option>
              <option value="AUTO">AUTO (Robot Executes)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-sec opacity-80">
              Execution Provider
            </label>
            <select
              value={config.executionProvider || "NONE"}
              onChange={(e) =>
                updateConfig("executionProvider", e.target.value)
              }
              className="bg-black/20 border border-brand-border/60 rounded-lg px-3 py-2 text-[11px] font-bold text-brand-text focus:outline-none focus:border-brand-accent transition-colors font-mono uppercase tracking-wide truncate cursor-pointer"
            >
              <option value="NONE">NONE (Execution Off)</option>
              <option value="META_API">MetaApi (Cloud MT5 Direct)</option>
              <option value="EA_BRIDGE">EA Webhook Bridge (Local MT5)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full border-b border-brand-border/40 pb-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-sec opacity-80">
              Lot Size (Fixed)
            </label>
            <input
              type="number"
              step="0.01"
              value={config.lotSize || 0.01}
              onChange={(e) =>
                updateConfig("lotSize", parseFloat(e.target.value))
              }
              className="bg-black/20 border border-brand-border/60 rounded-lg px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-sec opacity-80">
              Broker Profiling
            </label>
            <select
              value={config.broker || "Exness"}
              onChange={(e) => updateConfig("broker", e.target.value)}
              className="bg-black/20 border border-brand-border/60 rounded-lg px-3 py-2 text-[11px] font-bold text-brand-text focus:outline-none focus:border-brand-accent transition-colors font-mono uppercase tracking-wide cursor-pointer"
            >
              <option value="Exness">Exness (Zero/Raw Spread)</option>
              <option value="FBS">FBS</option>
              <option value="JustMarkets">JustMarkets</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 mt-1 border-t border-brand-border/30 pt-3">
          <ToggleRow
            label="Auto Take Profit & Stop Loss"
            desc="Apply AI's dynamic calculated TP & SL sizes"
            active={config.autoTP_SL}
            onToggle={() => updateConfig("autoTP_SL", !config.autoTP_SL)}
            icon={<Shield className="w-3.5 h-3.5" />}
          />

          <ToggleRow
            label="Smart Trailing Stop"
            desc="Secure profits automatically as trades go in favor"
            active={config.trailingStop}
            onToggle={() => updateConfig("trailingStop", !config.trailingStop)}
            icon={<Activity className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      <div className="bg-brand-bg-sec/30 border border-brand-border/50 rounded-xl p-4 flex flex-col gap-3 text-brand-text-sec text-[10px] sm:text-[11px] leading-relaxed shadow-sm">
        <div className="flex gap-2 text-brand-accent items-start">
          <Terminal className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            <strong className="text-brand-text uppercase tracking-widest text-[9px] mr-1">Server Execution:</strong>
            Auto trade executions run on the server side via the chosen provider.
          </p>
        </div>
        <div className="flex gap-2 items-start mt-1">
          <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="text-balance">
            <strong className="text-brand-text uppercase tracking-widest text-[9px] mr-1">Mobile User Info:</strong>
            Karena Anda menggunakan smartphone, aplikasi ini berjalan di Cloud. Agar auto trade dapat tereksekusi ke MetaTrader 5 (MT5), Anda <strong>WAJIB</strong> memilih <em>Execution Provider</em>:
            <br />
            <br />
            <span className="flex items-center gap-1.5 bg-black/20 p-2 rounded-lg border border-brand-border/30 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-info"></span>
              <strong>MetaApi (Cloud):</strong> Pilihan termudah untuk HP, tidak butuh PC/VPS.
            </span>
            <span className="flex items-center gap-1.5 bg-black/20 p-2 rounded-lg border border-brand-border/30">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-info"></span>
              <span>
                <strong>EA Webhook Bridge:</strong> Eksekusi via webhook ke EA lokal di VPS Anda.
              </span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, active, onToggle, icon }: any) {
  return (
    <div className="flex items-center justify-between py-2 w-full hover:bg-white/5 px-2 -mx-2 rounded-lg transition-colors cursor-pointer" onClick={onToggle}>
      <div className="flex gap-3 w-full items-center">
        <div
          className={cn(
            "shrink-0 bg-black/20 p-1.5 rounded-md border border-brand-border/40 shadow-inner",
            active ? "text-brand-success" : "text-brand-text-sec",
          )}
        >
          {icon}
        </div>
        <div className="flex flex-col">
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-brand-text">{label}</h4>
          <p className="text-[9.5px] text-brand-text-sec/80">{desc}</p>
        </div>
      </div>
      <div
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 focus:outline-none shadow-inner",
          active ? "bg-brand-success" : "bg-black/40 border border-brand-border/50",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full transition-all shadow-sm",
            active ? "translate-x-5 bg-white" : "translate-x-1 bg-brand-text-sec flex",
          )}
        />
      </div>
    </div>
  );
}
