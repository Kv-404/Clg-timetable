import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring",
        className,
      )}
      {...props}
    />
  );
}
