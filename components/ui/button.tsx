import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-600 text-white shadow-[0_14px_36px_-14px_rgba(37,99,235,0.68)] hover:brightness-110 hover:shadow-[0_16px_44px_-14px_rgba(5,150,105,0.7)]",
        secondary:
          "bg-gradient-to-r from-violet-700 via-fuchsia-700 to-rose-700 text-white shadow-[0_14px_34px_-14px_rgba(126,34,206,0.62)] hover:brightness-110",
        outline:
          "border border-slate-300/85 bg-white/92 text-slate-700 shadow-sm hover:border-cyan-400/70 hover:bg-cyan-100/70 hover:text-slate-900",
        ghost:
          "text-slate-700 hover:bg-cyan-100/70 hover:text-cyan-900",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
