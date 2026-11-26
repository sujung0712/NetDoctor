import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

class ResizeObserverPolyfill implements ResizeObserver {
  observe(): void {
    // No-op polyfill for Recharts ResponsiveContainer in jsdom
  }

  unobserve(): void {
    // No-op polyfill
  }

  disconnect(): void {
    // No-op polyfill
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverPolyfill;
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});
