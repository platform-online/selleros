import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title: string;
  body: string;
  retryLabel: string;
  homeLabel: string;
  detailLabel: string;
  onHome?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Screen-level crash containment (spec §133).
 * A failing screen never blanks the whole application, and the technical
 * detail is collapsed by default rather than shown as primary copy.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env?.DEV) {
      console.error('[SellerOS] screen crashed', error, info.componentStack);
    }
  }

  reset = (): void => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-state" role="alert">
        <h1 className="error-state__title">{this.props.title}</h1>
        <p className="error-state__body">{this.props.body}</p>
        <div className="row gap-3">
          <button type="button" className="btn btn--primary" onClick={this.reset}>
            {this.props.retryLabel}
          </button>
          {this.props.onHome && (
            <button type="button" className="btn btn--secondary" onClick={this.props.onHome}>
              {this.props.homeLabel}
            </button>
          )}
        </div>
        <details>
          <summary>{this.props.detailLabel}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error.stack ?? error.message}</pre>
        </details>
      </div>
    );
  }
}
