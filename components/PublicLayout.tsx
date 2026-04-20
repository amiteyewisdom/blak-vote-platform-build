import React from "react";
import PublicNav from "./PublicNav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface to-surface-elevated text-foreground flex flex-col">
      <PublicNav />
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {children}
      </main>
    </div>
  );
}
