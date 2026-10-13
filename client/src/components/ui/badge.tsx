import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", {
  variants: {
    variant: {
      default: "bg-muted text-foreground",
      scheduled: "text-muted-foreground",
      cancelled: "bg-danger-soft text-danger",
      changed: "bg-warning-soft text-warning",
      outline: "border border-border text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
