import type { ReactNode } from "react";

export function FeatureHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="feature-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="feature-header-actions">{actions}</div>}
    </header>
  );
}
