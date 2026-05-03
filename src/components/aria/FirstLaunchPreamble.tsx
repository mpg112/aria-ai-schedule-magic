import { useState } from "react";
import { Button } from "@/components/ui/button";
import AriaLogoMark from "@/components/aria/AriaLogoMark";
import { ArrowLeft, ArrowRight, Calendar, Coffee, ListChecks, Settings2 } from "lucide-react";
const PREVIEW_STEPS = [
  {
    id: 1,
    title: "Your fixed schedule",
    icon: Calendar,
    desc: "Tell Aria when you're locked in for work or class.",
  },
  {
    id: 2,
    title: "Meals (optional)",
    icon: Coffee,
    desc: "Breakfast, lunch, and dinner—adjust days and windows, add extras, or skip.",
  },
  {
    id: 3,
    title: "Your tasks",
    icon: ListChecks,
    desc: "Pick what you'd like to fit into the rest of your week.",
  },
  {
    id: 4,
    title: "Your preferences",
    icon: Settings2,
    desc: "A few small details that shape how Aria plans.",
  },
] as const;

interface Props {
  onComplete: () => void;
}

/**
 * Shown on /app when the profile is not onboarded and the user has not yet
 * completed Welcome → Intro (via these screens or the standalone routes).
 */
export default function FirstLaunchPreamble({ onComplete }: Props) {
  const [screen, setScreen] = useState<1 | 2 | 3>(1);

  const finish = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      {screen === 1 ? (
        <div className="w-full max-w-lg text-center space-y-8">
          <div className="flex justify-center">
            <AriaLogoMark size="lg" />
          </div>
          <div className="space-y-4">
            <h1 className="font-display text-4xl sm:text-5xl tracking-tight text-foreground">Welcome</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Aria would love to help you optimize your schedule—whether you&apos;re juggling classes, work, or
              everything in between.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <Button type="button" size="lg" className="min-w-[200px] rounded-xl shadow-soft" onClick={() => setScreen(2)}>
              Let&apos;s get started
            </Button>
            <button
              type="button"
              onClick={finish}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Skip to setup
            </button>
          </div>
        </div>
      ) : null}

      {screen === 2 ? (
        <div className="w-full max-w-lg space-y-8">
          <button
            type="button"
            onClick={() => setScreen(1)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <AriaLogoMark size="md" />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">What Aria will do</h1>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-left sm:text-center">
              In the next steps, Aria will ask a few questions about your schedule so it can plan your week with you.
              You&apos;ll share things like fixed commitments (work, class, recurring blocks), flexible tasks you want
              to fit in, any one-off events, and small preferences—when flexible tasks can start on weekdays vs weekends,
              quiet evenings, days you&apos;d like kept clear, and similar details that shape how your calendar looks.
            </p>
          </div>
          <div className="flex justify-center">
            <Button type="button" size="lg" className="min-w-[200px] rounded-xl shadow-soft gap-2" onClick={() => setScreen(3)}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {screen === 3 ? (
        <div className="w-full max-w-xl space-y-8">
          <button
            type="button"
            onClick={() => setScreen(2)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <AriaLogoMark size="md" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-foreground">Your setup in four steps</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              You&apos;ll walk through each of these in the dialog next—nothing is final until you save or skip.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PREVIEW_STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.id}
                  className="flex gap-3 rounded-xl border bg-card/80 p-4 text-left shadow-soft"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Step {s.id}</div>
                    <div className="font-medium text-foreground leading-snug">{s.title}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-center pt-2">
            <Button type="button" size="lg" className="min-w-[200px] rounded-xl shadow-soft gap-2" onClick={finish}>
              Begin setup
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
