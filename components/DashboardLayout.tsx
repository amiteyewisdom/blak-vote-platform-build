import React from "react";
import { Header } from "@/components/header";

export default function DashboardLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex bg-background text-foreground overflow-hidden">

      {/* Ambient background glow */}
      <div className="absolute w-[600px] h-[600px] bg-gold opacity-10 blur-[180px] rounded-full top-[-200px] left-[-200px]" />
      <div className="absolute w-[600px] h-[600px] bg-gold opacity-10 blur-[180px] rounded-full bottom-[-200px] right-[-200px]" />

      {/* Sidebar */}
      {sidebar ? (
        <aside className="relative z-10 w-64 border-r border-border bg-surface">
          {sidebar}
        </aside>
      ) : null}

      {/* Main Area */}
      <div className="relative z-10 flex-1 flex flex-col">
        <Header />

        <main className="flex-1 p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
