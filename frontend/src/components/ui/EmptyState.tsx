import { ReactNode } from "react";
import { Folder } from "lucide-react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon = <Folder className="w-5 h-5" />,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={`empty${className ? ` ${className}` : ""}`}>
      <div className="empty-icon">{icon}</div>
      <div className="h3" style={{ marginBottom: 6 }}>{title}</div>
      {description && (
        <div className="muted" style={{ maxWidth: 360, margin: "0 auto 18px", fontSize: 13 }}>
          {description}
        </div>
      )}
      {action}
    </div>
  );
}

export default EmptyState;
