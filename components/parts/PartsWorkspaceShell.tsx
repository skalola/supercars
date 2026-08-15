import type { ReactNode } from "react";

type PartsWorkspaceShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  contentLabel: string;
};

export function PartsWorkspaceShell({
  children,
  className = "",
  contentClassName = "",
  contentLabel,
}: PartsWorkspaceShellProps) {
  return (
    <main className={`parts-workspace-shell ${className}`.trim()}>
      <section
        className={`parts-workspace-content ${contentClassName}`.trim()}
        aria-label={contentLabel}
      >
        {children}
      </section>
    </main>
  );
}
