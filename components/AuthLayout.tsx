import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0B0F]">
      <div className="w-full max-w-md p-8 rounded-2xl shadow-xl bg-[#111118] border border-white/5">
        {children}
      </div>
    </div>
  );
}
