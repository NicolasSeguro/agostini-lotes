import * as React from "react";
import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default:
    "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
  secondary: "bg-sage-100 text-sage-900 hover:bg-sage-200",
  outline: "border border-stone-200 bg-white text-stone-800 hover:bg-cream-50",
  ghost: "text-stone-700 hover:bg-stone-100",
  danger: "bg-rose-500 text-white hover:bg-rose-600",
};

export function Button({
  className,
  variant = "default",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-11 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
