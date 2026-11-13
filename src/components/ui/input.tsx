import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring/40 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
