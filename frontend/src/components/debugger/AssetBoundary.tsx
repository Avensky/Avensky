import { Component, type ReactNode } from "react";

// An unavailable model must not tear down the collider experiment or the menu.
export class AssetBoundary extends Component<{ children: ReactNode; fallback: ReactNode; resetKey?: string }, { failed: boolean; resetKey?: string }> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromProps(props: { resetKey?: string }, state: { resetKey?: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
