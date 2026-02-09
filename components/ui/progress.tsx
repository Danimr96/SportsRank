import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function Progress({ value, className, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-bone-200", className)}
      {...props}
    >
      <div
        className="h-full bg-forest transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
