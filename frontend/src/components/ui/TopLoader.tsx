import { useEffect, useState } from "react";

// Global "something is loading" indicator: a bar at the top for any in-flight network request, plus a small
// "Loading…" pill if it takes longer than ~1s. Works for every page without touching them (it counts window.fetch).
// Short requests (<200ms) never flash it.
let active = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined" && !(window as any).__topLoaderPatched) {
  (window as any).__topLoaderPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args) => {
    active++;
    emit();
    try {
      return await orig(...args);
    } finally {
      active--;
      emit();
    }
  };
}

export function TopLoader() {
  const [show, setShow] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (active > 0) {
        t1 ??= setTimeout(() => setShow(true), 200);
        t2 ??= setTimeout(() => setSlow(true), 1000);
      } else {
        clearTimeout(t1);
        clearTimeout(t2);
        t1 = t2 = undefined;
        setShow(false);
        setSlow(false);
      }
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;
  return (
    <>
      <style>{`@keyframes pn-top-load{0%{left:-40%}100%{left:100%}}`}</style>
      <div
        className="fixed top-0 left-0 right-0 h-[3px] z-[9999] overflow-hidden bg-[#024BAB]/20"
        role="progressbar"
        aria-label="Loading"
      >
        <div
          className="absolute top-0 h-full w-2/5 bg-[#024BAB]"
          style={{ animation: "pn-top-load 1s ease-in-out infinite" }}
        />
      </div>
      {slow && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 text-xs font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[#024BAB] border-t-transparent animate-spin" />
          Loading…
        </div>
      )}
    </>
  );
}
