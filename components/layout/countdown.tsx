"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface CountdownProps {
  closesAt: string;
  className?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) {
    return "Closed";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export function Countdown({ closesAt, className }: CountdownProps) {
  const target = useMemo(() => new Date(closesAt).getTime(), [closesAt]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  if (now === null) {
    return <span className={cn("text-base font-medium text-stone-900", className)}>--</span>;
  }

  return (
    <span className={cn("text-base font-medium text-stone-900", className)}>
      {formatRemaining(target - now)}
    </span>
  );
}
