import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

const STORAGE_KEY = "aria-state-v1";

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, message: e.message || "Unknown error" };
  }

  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", e, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background px-6 py-12 text-foreground">
          <div className="mx-auto max-w-lg space-y-4">
            <h1 className="font-display text-2xl">Something went wrong</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Aria hit a runtime error (often from saved data in this browser). You can clear local data and reload,
              or open the planner at <span className="font-mono text-foreground">/app</span> after fixing.
            </p>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap break-words">
              {this.state.message}
            </pre>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(STORAGE_KEY);
                  } catch {
                    /* ignore */
                  }
                  window.location.reload();
                }}
              >
                Clear saved schedule &amp; reload
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const path = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/app`.replace(/\/+/g, "/");
                  window.location.assign(path);
                }}
              >
                Go to planner (/app)
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
