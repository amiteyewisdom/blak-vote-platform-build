import React from "react";
import { Header } from "@/components/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex bg-[#0B0B0F] text-white overflow-hidden">

      {/* Ambient background glow */}
      <div className="absolute w-[600px] h-[600px] bg-[#F5C044] opacity-5 blur-[180px] rounded-full top-[-200px] left-[-200px]" />
      <div className="absolute w-[600px] h-[600px] bg-[#F5C044] opacity-5 blur-[180px] rounded-full bottom-[-200px] right-[-200px]" />

      {/* Sidebar */}
      <aside className="relative z-10 w-64 border-r border-white/5 bg-[#0E101A]">
        {/* You will pass SidebarNav from organizer/admin layout */}
      </aside>

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
