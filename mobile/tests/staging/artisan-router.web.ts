// Test transport for the real screens; no application service is replaced.
import { useEffect, useSyncExternalStore } from "react";
type Destination =
  | string
  | { pathname: string; params?: Record<string, string> };
let current = new URLSearchParams(location.search).get("route") || "/artisan";
const history: string[] = [],
  listeners = new Set<() => void>();
function url(input: Destination) {
  if (typeof input === "string") return input;
  let path = input.pathname;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input.params || {})) {
    if (path.includes("[" + key + "]"))
      path = path.replace("[" + key + "]", value);
    else query.set(key, value);
  }
  return path + (query.size ? "?" + query : "");
}
function publish(path: string) {
  current = path;
  (globalThis as any).__runtimePath = current;
  listeners.forEach((fn) => fn());
}
export const router = {
  push(input: Destination) {
    history.push(current);
    publish(url(input));
  },
  replace(input: Destination) {
    publish(url(input));
  },
  dismissTo(input: Destination) {
    history.length = 0;
    publish(url(input));
  },
  canGoBack() {
    return history.length > 0;
  },
  back() {
    if (history.length) publish(history.pop()!);
  },
};
export function usePathname() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => current,
  ).split("?")[0];
}
export function useLocalSearchParams<T = Record<string, string>>(): T {
  usePathname();
  return {
    id: current.split("?")[0].split("/").at(-1),
    ...Object.fromEntries(new URLSearchParams(current.split("?")[1] || "")),
  } as T;
}
export function useFocusEffect(effect: () => void | (() => void)) {
  const path = usePathname();
  useEffect(effect, [effect, path]);
}
(globalThis as any).__runtimeNavigate = router.push;
(globalThis as any).__runtimePath = current;
