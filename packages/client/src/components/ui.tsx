import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-brand-card border border-brand-border rounded-xl p-3 flex flex-col gap-2",
        className,
      )}
      {...props}
    >
      {props.children}
    </div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-brand-text-sec uppercase tracking-[0.05em]">
      {children}
    </div>
  );
}

export function Metric({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-lg font-bold font-mono tracking-tighter text-brand-text truncate",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "success" | "danger" | "warning" | "info" | "accent";
}) {
  const variants = {
    default: "bg-brand-bg-sec text-brand-text-sec border-brand-border",
    success: "bg-brand-success/15 text-brand-success border-brand-success/30",
    danger: "bg-brand-danger/15 text-brand-danger border-brand-danger/30",
    warning: "bg-brand-warning/15 text-brand-warning border-brand-warning/30",
    info: "bg-brand-info/15 text-brand-info border-brand-info/30",
    accent: "bg-brand-accent/15 text-brand-accent border-brand-accent/30",
  };
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded border whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-center",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
