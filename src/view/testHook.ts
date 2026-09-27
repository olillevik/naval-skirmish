import type { WorldState } from '../core/world';

export interface TestHook {
  readonly state: WorldState;
}

declare global {
  interface Window {
    navalSkirmishTest?: TestHook;
  }
}

/** Exposes a read-only copy of the world state on `window`, only when the URL has `?test`. */
export function installTestHook(read: () => WorldState): void {
  if (!new URLSearchParams(window.location.search).has('test')) return;
  window.navalSkirmishTest = Object.freeze({
    get state() {
      return structuredClone(read());
    },
  });
}
