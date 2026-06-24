import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  RefreshCcw,
  Search,
  Filter,
  Trash2,
  Cpu,
} from "lucide-react";
import { Card } from "./ui";

import { apiFetch } from "../lib/api";

export function Errors() {
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL"); // ALL, DATA, API, DB

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/system/status");
      if (data.data && data.data.errors) {
        setErrors(data.data.errors);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearErrors = async () => {
    await apiFetch("/system/errors/clear", { method: "POST" });
    setErrors([]);
  };

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 3000);
    return () => clearInterval(iv);
  }, []);

  const filteredErrors = useMemo(() => {
    return errors.filter((err) => {
      if (search && !err.message.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (filter !== "ALL") {
        if (
          filter === "DATA" &&
          !err.message.toLowerCase().includes("market data")
        )
          return false;
        if (filter === "API" && !err.message.toLowerCase().includes("api"))
          return false;
        if (filter === "DB" && !err.message.toLowerCase().includes("firestore"))
          return false;
      }
      return true;
    });
  }, [errors, search, filter]);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-brand-text">
          System Errors
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const errorText = errors
                .slice(0, 5)
                .map((e) => `${new Date(e.time).toISOString()} - ${e.message}`)
                .join("\n");
              window.dispatchEvent(
                new CustomEvent("ask-ai", {
                  detail: `Analyze these errors:\n${errorText}`,
                }),
              );
            }}
            className="p-2 rounded bg-[#00BFFF]/10 border border-[#00BFFF]/30 text-[#00BFFF] hover:bg-[#00BFFF]/20 transition-colors"
            title="Ask AI Mechanic"
          >
            <Cpu className="w-4 h-4" />
          </button>
          <button
            onClick={clearErrors}
            className="p-2 rounded bg-brand-bg-sec border border-brand-border text-brand-danger hover:bg-brand-danger/10 transition-colors"
            title="Clear Errors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-2 rounded bg-brand-bg-sec border border-brand-border text-brand-text hover:bg-brand-card disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCcw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-sec" />
          <input
            type="text"
            className="w-full bg-brand-card border border-brand-border rounded-lg pl-9 pr-3 py-2 text-sm text-brand-text placeholder-brand-text-sec focus:border-brand-accent outline-none transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-brand-card border border-brand-border rounded-lg px-2 py-2 text-sm text-brand-text outline-none focus:border-brand-accent transition-colors"
        >
          <option value="ALL">All Types</option>
          <option value="DATA">Market Data</option>
          <option value="API">API/External</option>
          <option value="DB">Firestore</option>
        </select>
      </div>

      <Card className="flex flex-col gap-4 p-4 border border-brand-border">
        {filteredErrors.length === 0 ? (
          <div className="text-center py-8 text-brand-text-sec flex flex-col items-center gap-2">
            <div className="bg-brand-success/10 p-3 rounded-full mb-2">
              <AlertTriangle className="w-8 h-8 text-brand-success" />
            </div>
            <p className="font-semibold text-brand-text">No Errors Found</p>
            <p className="text-xs max-w-[200px] leading-tight">
              Your filters matched no errors, or the system is free of faults.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredErrors.map((err, i) => {
              const timeStr = new Date(err.time).toLocaleTimeString("id-ID", {
                timeZone: "Asia/Makassar",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              const dateStr = new Date(err.time).toLocaleDateString("id-ID", {
                timeZone: "Asia/Makassar",
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={i}
                  className="flex gap-3 items-start bg-brand-danger/5 border border-brand-danger/20 p-3 rounded-xl hover:border-brand-danger/40 transition-colors"
                >
                  <div className="bg-brand-danger/20 p-2 rounded-lg text-brand-danger shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brand-danger mb-1 leading-snug">
                      {err.message}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-brand-text-sec font-mono uppercase tracking-wider">
                      <Clock className="w-3 h-3" />
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{timeStr} WITA</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
