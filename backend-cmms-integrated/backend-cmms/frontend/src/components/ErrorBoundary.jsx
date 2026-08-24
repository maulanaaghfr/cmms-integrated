import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch() {
    // errors are surfaced in the fallback UI below; nothing else to log here.
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  handleHome = () => {
    this.setState({ error: null });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
          <div className="soft-card w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">Terjadi kesalahan</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Halaman ini mengalami masalah saat menampilkan data. Coba muat ulang halaman atau kembali ke dashboard.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
              >
                <RotateCcw className="h-4 w-4" /> Muat Ulang
              </button>
              <button
                onClick={this.handleHome}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-secondary/70 active:scale-[0.98]"
              >
                <Home className="h-4 w-4" /> Ke Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
