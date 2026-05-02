import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AriaLogoMark from "@/components/aria/AriaLogoMark";

export default function Welcome() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg text-center space-y-8">
        <div className="flex justify-center">
          <AriaLogoMark size="lg" />
        </div>
        <div className="space-y-4">
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight text-foreground">Welcome</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Aria would love to help you optimize your schedule—whether you&apos;re juggling classes, work,
            or everything in between.
          </p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <Button asChild size="lg" className="min-w-[200px] rounded-xl shadow-soft">
            <Link to="/intro">Let&apos;s get started</Link>
          </Button>
          <Link
            to="/app"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Already set up? Open your planner
          </Link>
        </div>
      </div>
    </div>
  );
}
