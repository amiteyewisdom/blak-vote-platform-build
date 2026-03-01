import React from "react";

export function PrimaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`bg-gradient-to-r from-[#F5C044] to-[#E6B030] text-[#0B0B0F] font-semibold rounded-2xl px-6 py-3 shadow-md hover:scale-[1.02] hover:shadow-yellow-500/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#F5C044] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
