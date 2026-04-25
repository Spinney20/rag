import { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export type BadgeVariant =
  | "default"
  | "neutral"
  | "conform"
  | "neconform"
  | "partial"
  | "insufficient"
  | "review"
  | "amber";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default:      "",
  neutral:      "",
  conform:      "verdict-conform",
  neconform:    "verdict-neconform",
  partial:      "verdict-partial",
  insufficient: "verdict-insufficient",
  review:       "verdict-review",
  amber:        "badge-amber",
};

export function Badge({ variant = "default", dot, children, className, ...rest }: BadgeProps) {
  return (
    <span className={clsx("badge", VARIANT_CLASS[variant], className)} {...rest}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export default Badge;
