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
