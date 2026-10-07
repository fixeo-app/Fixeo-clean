import { calculateQuote, type QuoteLine } from './artisanExperience';

/** One gate for tabs, contextual actions, preview and submission. IDs from a
 * route are suggestions: only the freshly loaded canonical source authorizes. */
export function validateQuote(input: {
  origin: string; title: string; clientId: string; requestId: string;
  clients: { id: string }[]; offers: { request_id: string }[];
  items: Pick<QuoteLine, 'type' | 'label' | 'quantity' | 'unit_price'>[];
  discount: number;
}) {
  const sourceValid = input.origin === 'personal'
    ? input.clients.some(client => client.id === input.clientId)
    : input.origin === 'fixeo' && input.offers.some(offer => offer.request_id === input.requestId);
  const sourceError = input.origin === 'personal'
    ? 'Choisissez le client personnel de ce devis.'
    : 'Choisissez une opportunité FIXEO active pour continuer.';
  const identityError = !sourceValid ? sourceError : !input.title.trim() ? 'Donnez un titre à votre devis.' : input.title.trim().length > 200 ? 'Limitez le titre à 200 caractères.' : '';
  let calculated: ReturnType<typeof calculateQuote> | null = null;
  try { if (sourceValid && input.items.every(line => line.label.trim().length <= 500)) calculated = calculateQuote(input.items, input.origin === 'personal' ? input.discount : 0); } catch {}
  const lineError = !calculated || calculated.total <= 0
    ? 'Complétez chaque ligne avec une désignation, une quantité et un prix. Le total doit être supérieur à zéro.'
    : input.origin === 'fixeo' && !calculated.items.some(line => line.type !== 'supply')
      ? 'Ajoutez la prestation ou la main-d’œuvre de cette intervention.' : '';
  return { sourceValid, calculated, identityError, lineError,
    canEnterLines: !identityError, canEnterConditions: !identityError && !lineError,
    canPreview: !identityError && !lineError, canSave: !identityError && !lineError,
    message: identityError || lineError };
}
