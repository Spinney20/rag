import { Badge, BadgeVariant } from "./Badge";

const VERDICT_MAP: Record<string, { variant: BadgeVariant; text: string }> = {
  CONFORM:           { variant: "conform",      text: "Conform" },
  NECONFORM:         { variant: "neconform",    text: "Neconform" },
  PARTIAL:           { variant: "partial",      text: "Parțial" },
  INSUFFICIENT_DATA: { variant: "insufficient", text: "Insuficient" },
};

export interface VerdictBadgeProps {
  verdict: string;
  className?: string;
}

export function VerdictBadge({ verdict, className }: VerdictBadgeProps) {
  const it = VERDICT_MAP[verdict] || VERDICT_MAP.INSUFFICIENT_DATA;
  return (
    <Badge variant={it.variant} dot className={className}>
      {it.text}
    </Badge>
  );
}

export default VerdictBadge;
