import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AriaLogoMark from "@/components/aria/AriaLogoMark";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function Intro() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg space-y-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <AriaLogoMark size="md" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">What Aria will do</h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed text-left sm:text-center">
            In the next steps, Aria will ask a few questions about your schedule so it can plan your week with you.
            You&apos;ll share things like fixed commitments (work, class, recurring blocks), flexible tasks you want to
            fit in, any one-off events, and small preferences—morning start, quiet evenings, days you&apos;d like kept
            clear, and similar details that shape how your calendar looks.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild size="lg" className="min-w-[200px] rounded-xl shadow-soft gap-2">
            <Link to="/app">
              Ready? Let&apos;s go
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
