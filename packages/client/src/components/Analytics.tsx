import React, { useState, useEffect } from "react";
import { Card, Metric, CardLabel, cn } from "./ui";
import { apiFetch } from "../lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Activity, Target, AlertTriangle, ShieldCheck } from "lucide-react";

export function Analytics() {
  const [stats, setStats] = useState({
    winRate: 0,
    lossRate: 0,
    beRate: 0,
    totalSignals: 0,
    aiAcceptance: 0,
    avgRR: "0",
  });

  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchSignals = async () => {
      const res = await apiFetch("/signals");
      if (res.data && res.data.length > 0) {
        const sigs = res.data;
        const aiApproved = sigs.filter(
          (s: any) => s.ai_verdict === "APPROVED",
        ).length;

        const winsList = sigs.filter((s: any) =>
          ["WIN", "TP1 HIT", "TP2 HIT", "TP3 HIT"].includes(s.result),
        );
        const lossesList = sigs.filter((s: any) => s.result === "LOSS");
        const beList = sigs.filter((s: any) => s.result === "BREAKEVEN");

        const wins = winsList.length;
        const losses = lossesList.length;
        const be = beList.length;

        const totalCompleted = wins + losses + be;

        let avgRRCalcStr = "--";
        const approvedSignals = sigs.filter(
          (s: any) => s.ai_verdict === "APPROVED" && s.rrRatio,
        );
        if (approvedSignals.length > 0) {
          const sumRR = approvedSignals.reduce(
            (acc: number, val: any) => acc + (val.rrRatio || 0),
            0,
          );
          avgRRCalcStr = `1:${(sumRR / approvedSignals.length).toFixed(2)}`;
        }

        setStats({
          totalSignals: sigs.length,
          aiAcceptance: Math.round((aiApproved / sigs.length) * 100) || 0,
          winRate:
            totalCompleted > 0 ? Math.round((wins / totalCompleted) * 100) : 0,
          lossRate:
            totalCompleted > 0
              ? Math.round((losses / totalCompleted) * 100)
              : 0,
          beRate:
            totalCompleted > 0 ? Math.round((be / totalCompleted) * 100) : 0,
          avgRR: avgRRCalcStr,
        });

        // Prepare chart data (Group by day or just outcome dist)
        const distribution = [
          { name: "TP", value: winsList.length, color: "#00FF94" },
          { name: "BE", value: beList.length, color: "#00BFFF" },
          { name: "LOSS", value: lossesList.length, color: "#FF3366" },
          {
            name: "PENDING",
            value: sigs.filter((s: any) =>
              ["PENDING", "ACTIVE", "AWAITING"].includes(s.result),
            ).length,
            color: "#9ca3af",
          },
        ];
        setChartData(distribution);
      }
    };
    fetchSignals();
    const interval = setInterval(fetchSignals, 10000); // Reload every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-brand-info" />
        <h2 className="text-xl font-bold tracking-tight text-brand-text">
          Performance Analytics
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="h-[110px] justify-between relative overflow-hidden">
          <div className="absolute -right-2 -top-2 opacity-10">
            <Activity className="w-16 h-16 text-brand-success" />
          </div>
          <CardLabel>Win Rate (TP Hits)</CardLabel>
          <Metric className="text-brand-success">
            {stats.totalSignals > 0 ? `${stats.winRate}%` : "--%"}
          </Metric>
        </Card>

        <Card className="h-[110px] justify-between relative overflow-hidden">
          <div className="absolute -right-2 -top-2 opacity-10">
            <ShieldCheck className="w-16 h-16 text-brand-info" />
          </div>
          <CardLabel>Breakeven Rate</CardLabel>
          <Metric className="text-brand-info">
            {stats.totalSignals > 0 ? `${stats.beRate}%` : "--%"}
          </Metric>
        </Card>

        <Card className="h-[110px] justify-between relative overflow-hidden">
          <div className="absolute -right-2 -top-2 opacity-10">
            <AlertTriangle className="w-16 h-16 text-brand-danger" />
          </div>
          <CardLabel>Loss Rate</CardLabel>
          <Metric className="text-brand-danger">
            {stats.totalSignals > 0 ? `${stats.lossRate}%` : "--%"}
          </Metric>
        </Card>

        <Card className="h-[110px] justify-between">
          <CardLabel>Avg Active RR</CardLabel>
          <Metric className="text-brand-text">{stats.avgRR}</Metric>
        </Card>
        <Card className="h-[110px] justify-between">
          <CardLabel>Total Signals Scanned</CardLabel>
          <Metric className="text-brand-accent">{stats.totalSignals}</Metric>
        </Card>

        <Card className="h-[110px] justify-between">
          <CardLabel>AI Acceptance</CardLabel>
          <Metric className="text-brand-accent">
            {stats.totalSignals > 0 ? `${stats.aiAcceptance}%` : "--%"}
          </Metric>
        </Card>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-xl p-5 mb-4">
        <h3 className="text-sm font-bold tracking-tight text-brand-text mb-4">
          Outcome Distribution
        </h3>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 0, left: -20, right: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  backgroundColor: "#1a1f2e",
                  border: "1px solid #2d3748",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
