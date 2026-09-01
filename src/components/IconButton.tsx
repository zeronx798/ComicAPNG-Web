import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  compact?: boolean;
}

export function IconButton({ icon: Icon, label, compact, className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`button icon-button ${compact ? "compact" : ""} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
