import { Component, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unexpected error",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("UI runtime error:", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-shell">
        <section className="panel workspace">
          <div className="card">
            <h3>Chat UI recovered from an error</h3>
            <p>
              A runtime issue occurred while rendering this view.
            </p>
            <p>
              Details: <code>{this.state.message}</code>
            </p>
            <div className="row single">
              <button onClick={() => window.location.reload()}>Reload App</button>
            </div>
          </div>
        </section>
      </main>
    );
  }
}

