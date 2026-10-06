export const MOBILE_UI_DEADLINE_MS = 12_000;

export async function withMobileDeadline<T>(
  task: PromiseLike<T>,
  timeoutMs = MOBILE_UI_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      Promise.resolve(task),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('MOBILE_UI_TIMEOUT')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isMobileUiTimeout(error: unknown) {
  return String((error as any)?.message || '') === 'MOBILE_UI_TIMEOUT';
}

/** RN 0.81 installs abort-controller, which has no AbortSignal.timeout(). */
export async function fetchMobileJson(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const body = await response.json().catch(() => null);
        return { response, body };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('GATEWAY_UNAVAILABLE')); }, timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
