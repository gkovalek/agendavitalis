import { ReactNode } from 'react';
import { TopNavbar } from '@/components/TopNavbar';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNavbar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
