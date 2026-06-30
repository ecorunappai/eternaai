import { Bell, Search, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function AppShell({ children, title, breadcrumb }: { children: ReactNode; title?: string; breadcrumb?: string }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <span>Eterna AI</span>
            <span>/</span>
            <span className="text-foreground font-medium">{breadcrumb ?? title ?? "Dashboard"}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search assets, cases, URLs..."
                className="h-10 w-80 rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <button className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 h-10 text-sm font-medium text-foreground hover:bg-accent">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask Eterna
            </button>
            <button className="relative grid h-10 w-10 place-items-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-accent">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
