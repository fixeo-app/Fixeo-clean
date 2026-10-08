import cities from './clientCities.generated.json';
import { canonicalCity } from './clientLocation';

export type NeedFact = { value: string; provenance: 'observed' | 'user_declared' | 'ai_inferred' | 'user_confirmed'; confirmed: boolean; dependencies: string[] };
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** A textual mention is only a proposal. Multiple distinct cities stay ambiguous. */
export function proposedCity(description: string) {
  const text = ` ${fold(description).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const matches = cities.filter(city => [city.value, ...city.aliases].some(alias => text.includes(` ${fold(alias)} `)));
  return matches.length === 1 ? matches[0].value : undefined;
}
export function cityProposal(description: string, current: string, explicitlyChosen: boolean) {
  const suggested = proposedCity(description);
  return { suggested, conflict: !!suggested && !!canonicalCity(current) && suggested !== canonicalCity(current),
    value: explicitlyChosen && current ? current : suggested || current, confirmed: explicitlyChosen };
}
export function confirmedMetierHint(service: string) {
  const key = fold(service).trim();
  return ['plomberie','electricite','serrurerie','climatisation','bricolage','menuiserie','peinture','maconnerie','nettoyage','jardinage','demenagement','carrelage','autre'].includes(key) ? key : undefined;
}
export function needFacts(input: { revision: number; description: string; descriptionConfirmed: boolean; city: string; cityConfirmed: boolean; cityProposed?: boolean; service: string; serviceConfirmed: boolean; media?: string }) {
  return { version: 1 as const, revision: input.revision,
    description: { value: input.description, provenance: input.descriptionConfirmed ? 'user_confirmed' : 'user_declared', confirmed: input.descriptionConfirmed, dependencies: [] } as NeedFact,
    city: { value: input.city, provenance: input.cityConfirmed ? 'user_confirmed' : input.cityProposed ? 'ai_inferred' : 'user_declared', confirmed: input.cityConfirmed, dependencies: input.cityProposed && !input.cityConfirmed ? ['description'] : [] } as NeedFact,
    service: { value: input.service, provenance: input.serviceConfirmed ? 'user_confirmed' : 'ai_inferred', confirmed: input.serviceConfirmed, dependencies: ['description'] } as NeedFact,
    media: { value: input.media || '', provenance: 'user_declared', confirmed: false, dependencies: ['description','city'] } as NeedFact };
}
