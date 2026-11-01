"use client";
import { Component, type ReactNode } from "react";

/** Rendering failures never replace the authoritative campaign state. */
export default class MapPresentationBoundary extends Component<
  {
    children: ReactNode;
    onUnavailable: (message: string) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onUnavailable("3D harita yüklenemedi.");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
