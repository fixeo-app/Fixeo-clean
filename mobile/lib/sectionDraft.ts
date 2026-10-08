export type SectionDraft<T> = { scope: string; value: T; baseline: T; remote: T; conflict: boolean };
export const equalDraft = (a: unknown,b:unknown) => JSON.stringify(a) === JSON.stringify(b);
export function reconcileSection<T>(previous: SectionDraft<T> | null, scope: string, remote: T): SectionDraft<T> {
  if (!previous || previous.scope !== scope || equalDraft(previous.value,previous.baseline))
    return {scope,value:remote,baseline:remote,remote,conflict:false};
  if (equalDraft(previous.value,remote)) return {scope,value:remote,baseline:remote,remote,conflict:false};
  return {...previous,remote,conflict:!equalDraft(previous.baseline,remote)};
}
