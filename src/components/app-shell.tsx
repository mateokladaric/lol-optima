import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  headerTabs?: ReactNode;
};

export function AppShell({ children, headerTabs }: AppShellProps) {
  return (
    <div className="dpm-bg-glow flex flex-col h-screen">
      <header className="sticky top-0 z-40 flex items-center justify-between h-[50px] min-h-[50px] px-4 lg:px-6 bg-dpm-header border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">LoL</span>
          <span className="text-lg font-bold text-dpm-accent">Optima</span>
        </div>

        <div className="flex items-center gap-4">
          {headerTabs}
          <span className="hidden sm:flex items-center gap-1 text-xs text-dpm-muted">
            <span className="dpm-kbd">F4</span>
            <span>dev tabs</span>
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 max-w-7xl w-full mx-auto px-4 lg:px-8 py-2">
          {children}
        </div>
      </main>
    </div>
  );
}
