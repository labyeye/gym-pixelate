import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="border-2 border-black bg-white p-8 max-w-md text-center">
          <h1 className="font-display font-bold text-2xl mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mb-5">
            The page hit an unexpected error. Reloading usually fixes it. If it
            keeps happening, please contact support.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="border-2 border-black bg-[#024BAB] text-white px-5 py-2 text-sm font-bold uppercase"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
