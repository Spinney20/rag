import { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
}

export function IconButton({ icon, label, className, ...rest }: IconButtonProps) {
  return (
    <button className={clsx("icon-btn", className)} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  );
}

export default IconButton;
