import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { artisanAccess, artisanHomeReaders } from "./artisanOS";
import { createArtisanProgressive } from "./artisanProgressive";
import { useForegroundRefresh } from "./useForegroundRefresh";

export function useArtisanHome() {
  const [, render] = useState(0);
  const controller = useRef<ReturnType<
    typeof createArtisanProgressive<typeof artisanHomeReaders>
  > | null>(null);
  if (!controller.current)
    controller.current = createArtisanProgressive(
      artisanAccess,
      artisanHomeReaders,
      () => render((n) => n + 1),
    );
  const c = controller.current;
  const reload = useCallback(async () => {
    await c.refresh(true);
  }, [c]);
  useFocusEffect(
    useCallback(() => {
      c.resume();
      void reload();
      return () => c.pause();
    }, [c, reload]),
  );
  useForegroundRefresh(reload);
  const m = c.state.modules;
  const allowed = c.state.authority.status === "ready";
  const value = <K extends keyof typeof m>(key: K) =>
    allowed ? m[key].data : null;
  return {
    authority: c.state.authority,
    modules: m,
    data: allowed
      ? {
          mission: value("mission"),
          offers: value("offers"),
          profile: value("profile"),
          jobs: value("jobs"),
          quotes: value("quotes"),
          ledger: value("ledger"),
        }
      : null,
    reload,
    retry: (key: keyof typeof m) => c.retry(key),
  };
}
