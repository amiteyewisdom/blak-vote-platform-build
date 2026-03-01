import React from "react";

export function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-4 mb-2">
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        {children}
      </div>
      <div className="h-px w-full bg-gradient-to-r from-[#F5C044] via-white/10 to-transparent" />
    </div>
  );
}
