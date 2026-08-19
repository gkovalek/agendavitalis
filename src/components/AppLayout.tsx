import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Bell, Search } from 'lucide-react';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <div className="min-h-screen flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl md:px-6">
            <SidebarTrigger className="h-9 w-9 rounded-lg hover:bg-accent" />
            <div className="hidden h-9 w-px bg-border md:block" />
            <div className="flex min-w-0 flex-1 items-center">
              <div className="hidden max-w-sm flex-1 items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm md:flex">
                <Search className="h-4 w-4" />
                <span>Buscar en Vitalis...</span>
                <kbd className="ml-auto rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘ K</kbd>
              </div>
            </div>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label="Notificaciones">
              <Bell className="h-4 w-4" />
              <span className="vitalis-pulse-dot absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
          </header>
          <main className="min-w-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
