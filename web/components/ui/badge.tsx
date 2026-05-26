import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "slate";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  slate: "bg-slate-200 text-slate-800",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
};

export function Badge({ tone = "neutral", className, ...props }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
