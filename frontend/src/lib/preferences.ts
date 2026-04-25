import { useEffect, useState } from "react";

/**
 * Tiny user-preferences layer. localStorage-backed, no external state library.
 * Components read via the hook; anyone (e.g. a sidebar toggle) writes via the
 * setter. A custom event keeps every consumer in sync within the tab; the
 * native `storage` event syncs across tabs.
 */

const PARTICLES_KEY = "rc-particles-enabled";
const PREF_EVENT = "rc-pref-change";

function readParticlesEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PARTICLES_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setParticlesEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(PARTICLES_KEY, enabled ? "on" : "off");
  } catch {
    // private mode / quota exceeded — keep going, just no persistence.
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}

export function useParticlesEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(readParticlesEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readParticlesEnabled());
    window.addEventListener(PREF_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREF_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return enabled;
}
