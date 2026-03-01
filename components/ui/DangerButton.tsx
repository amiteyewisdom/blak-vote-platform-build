import React from "react";

export function DangerButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`bg-gradient-to-r from-red-500 to-red-700 text-white font-semibold rounded-2xl px-6 py-3 shadow hover:scale-[1.02] hover:shadow-red-500/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
