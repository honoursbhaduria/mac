import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// Recharts' ResponsiveContainer relies on ResizeObserver, which jsdom lacks. Report a fixed
// size so charts lay out and render their SVG marks.
class RO {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = { width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800, x: 0, y: 0 };
    this.cb([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
