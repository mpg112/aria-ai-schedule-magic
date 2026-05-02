import { CalendarDays, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type LogoSize = "lg" | "md" | "sm";

const presets: Record<
  LogoSize,
  {
    wrap: string;
    calendar: string;
    /** Original-logo style sparkle (stroke icon), upper-right of calendar glyph */
    sparkles: string;
    sparklesTone: string;
  }
> = {
  lg: {
    wrap: "h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-soft",
    calendar: "h-7 w-7",
    sparkles: "h-3.5 w-3.5",
    sparklesTone: "text-primary-foreground",
  },
  md: {
    wrap: "h-12 w-12 rounded-xl bg-primary/10 text-primary",
    calendar: "h-6 w-6",
    sparkles: "h-3 w-3",
    sparklesTone: "text-primary",
  },
  sm: {
    wrap: "h-9 w-9 rounded-xl bg-primary text-primary-foreground shadow-soft",
    calendar: "h-4 w-4",
    sparkles: "h-2.5 w-2.5",
    sparklesTone: "text-primary-foreground",
  },
};

interface AriaLogoMarkProps {
  size: LogoSize;
  className?: string;
  /** True when the logo sits beside a visible “Aria” title (header). */
  decorative?: boolean;
}

/** Calendar tile with a single Sparkles accent (same motif as the original logo), upper-right of the calendar icon. */
export default function AriaLogoMark({ size, className, decorative }: AriaLogoMarkProps) {
  const p = presets[size];
  return (
    <div
      className={cn("inline-flex shrink-0", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Aria"}
      aria-hidden={decorative ? true : undefined}
    >
      <div className={cn("relative grid place-items-center", p.wrap)}>
        <span className="relative z-[1] inline-grid place-items-center">
          <CalendarDays className={p.calendar} aria-hidden />
          <Sparkles
            className={cn(
              "pointer-events-none absolute z-[2] -right-1 -top-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]",
              p.sparkles,
              p.sparklesTone
            )}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </div>
    </div>
  );
}
