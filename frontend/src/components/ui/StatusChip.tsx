import clsx from "clsx";
import { STATUS_MAP } from "@/lib/types";

export interface StatusChipProps {
  status: string;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const meta = STATUS_MAP[status] || { label: status, dot: "" as const };
  return (
    <span className={clsx("status-chip", className)}>
      <span className={clsx("status-dot", meta.dot)} />
      {meta.label}
    </span>
  );
}

export default StatusChip;
