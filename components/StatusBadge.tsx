import React from "react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-secondary text-gold border border-gold/50",
  pending: "bg-gold text-gold-foreground border border-gold",
  closed: "bg-secondary text-muted-foreground border border-border",
};

export function StatusBadge({ status }: { status: "draft" | "pending" | "closed" }) {
  return (
    <span
      className={`inline-block px-4 py-1 rounded-2xl text-xs font-semibold uppercase tracking-wider shadow-sm transition-all duration-200 ${
        STATUS_STYLES[status] || STATUS_STYLES.draft
      }`}
    >
      {status === 'pending' ? 'published' : status}
    </span>
  );
}
