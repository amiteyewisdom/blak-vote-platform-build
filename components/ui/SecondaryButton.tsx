import React from "react";

export function SecondaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`bg-[#181822] text-white border border-white/10 font-semibold rounded-2xl px-6 py-3 shadow hover:scale-[1.02] hover:shadow-yellow-500/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#F5C044] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
