import React from "react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-[#181822] text-[#F5C044] border border-[#F5C044]",
  published: "bg-[#F5C044] text-[#0B0B0F] border border-[#F5C044]",
  closed: "bg-[#181822] text-neutral-400 border border-white/10",
};

export function StatusBadge({ status }: { status: "draft" | "published" | "closed" }) {
  return (
    <span
      className={`inline-block px-4 py-1 rounded-2xl text-xs font-semibold uppercase tracking-wider shadow-sm transition-all duration-200 ${
        STATUS_STYLES[status] || STATUS_STYLES.draft
      }`}
    >
      {status}
    </span>
  );
}
