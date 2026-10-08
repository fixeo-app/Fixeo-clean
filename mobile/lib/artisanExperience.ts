import { profileMissingMessage } from './artisanProfileGate';
import { moneyMinor, lineTotalMinor } from './moneyContract';
export type QuoteLine = {
  type: "service" | "supply" | "labor";
  label: string;
  quantity: number;
  unit_price: number;
  total: number;
};
export const availabilityLabels: Record<string, string> = {
  available: "Disponible",
  busy: "Occupé",
  unavailable: "Indisponible",
};
export const businessStatus: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoi déclaré",
  accepted: "Accord déclaré",
  rejected: "Refus déclaré",
  expired: "Expiré",
  cancelled: "Annulé",
  planned: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  assigned: "Acceptée",
  validated: "Validée",
  submitted: "Vérification FIXEO",
  approved: "Validé par FIXEO",
  presented: "Présenté au client",
  pending: "En attente",
  done: "Terminée",
};
export function money(value: number | null | undefined) {
  return value != null && Number.isFinite(value)
    ? new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 2 }).format(
        value,
      ) + " MAD"
    : "Non renseigné";
}
export function localDay(value: string | Date = new Date()) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function when(value?: string | null) {
  if (!value) return "À planifier";
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("fr-FR", {
        timeZone: "Africa/Casablanca",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Date indisponible";
}
export function calculateQuote(
  lines: Omit<QuoteLine, "total">[],
  discount = 0,
) {
  if (
    !lines.length ||
    lines.length > 50 ||
    !Number.isFinite(discount) ||
    discount < 0
  )
    throw new Error("QUOTE_INVALID");
  const items = lines.map((line) => {
    if (
      !["service", "supply", "labor"].includes(line.type) ||
      !line.label.trim() ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 100000 ||
      !Number.isFinite(line.unit_price) ||
      line.unit_price < 0 ||
      line.unit_price > 500000
    )
      throw new Error("QUOTE_LINE_INVALID");
    return {
      ...line,
      label: line.label.trim(),
      total: lineTotalMinor(line.quantity, line.unit_price) / 100,
    };
  });
  const subtotal =
    items.reduce((sum, l) => sum + moneyMinor(l.total), 0) / 100;
  if (discount > subtotal || subtotal > 500000)
    throw new Error("QUOTE_AMOUNT_INVALID");
  return {
    items,
    subtotal,
    discount: moneyMinor(discount) / 100,
    total: (moneyMinor(subtotal) - moneyMinor(discount)) / 100,
  };
}
export function ledgerTotals(
  rows: { entry_type: string; amount: number; occurred_on: string }[],
  day?: string,
) {
  const selected = day ? rows.filter((r) => r.occurred_on === day) : rows;
  return {
    income: selected
      .filter((r) => r.entry_type === "income")
      .reduce((s, r) => s + moneyMinor(r.amount), 0) / 100,
    expense: selected
      .filter((r) => r.entry_type === "expense")
      .reduce((s, r) => s + moneyMinor(r.amount), 0) / 100,
  };
}
/** Identical starts only: no invented appointment duration. */
export function agendaConflicts(
  jobs: { scheduled_at: string | null; status: string }[],
) {
  const starts = new Map<string, number>();
  for (const j of jobs)
    if (j.scheduled_at && !["cancelled", "completed"].includes(j.status)) {
      const at = new Date(j.scheduled_at).toISOString();
      starts.set(at, (starts.get(at) || 0) + 1);
    }
  return new Set(
    [...starts].filter(([, count]) => count > 1).map(([at]) => at),
  );
}
export function artisanError(error: unknown) {
  const message = String((error as any)?.message || error || "");
  if (
    /SESSION_REVOKED|AUTH_REQUIRED|UNAUTHENTICATED|JWT|token.*expired/i.test(
      message,
    )
  )
    return "Votre session a expiré. Reconnectez-vous pour continuer.";
  if (
    /ARTISAN_REQUIRED|artisan_role_required|permission denied|42501/i.test(
      message,
    )
  )
    return "Cet espace est réservé au compte Artisan autorisé.";
  if (/TIMEOUT|deadline|AbortError/i.test(message))
    return "Le réseau met trop de temps. Vérifiez l’état puis réessayez.";
  if (/already_claimed|offer_not_active|offer_not_found/i.test(message))
    return "Cette opportunité n’est plus disponible. Actualisez la liste.";
  if (/AVAILABILITY_CONFIRMATION_PENDING/.test(message))
    return "Le statut n’a pas pu être confirmé. Actualisez avant de réessayer.";
  if (/onboarding_required|profile_incomplete/i.test(message))
    return profileMissingMessage((error as { missingFields?: string[] })?.missingFields);
  if (/not_approved/i.test(message))
    return "Votre profil doit être approuvé par FIXEO avant cette action.";
  if (/invalid_phone/i.test(message))
    return "Renseignez un numéro de téléphone marocain valide.";
  if (/PENDING_WRITE|BUSINESS_PENDING_CONFLICT/.test(message)) return "Une opération reste à vérifier. Reprenez ses informations conservées avant une nouvelle saisie.";
  if (/CLIENT_VERSION_CONFLICT/.test(message)) return "Cette fiche a changé sur le serveur. Votre saisie est conservée ; comparez les versions.";
  if (/DRAFT_PERSIST_FAILED/.test(message)) return "La copie locale n’a pas pu être enregistrée. Aucune nouvelle écriture serveur n’a été lancée.";
  if (/PROFILE_VERSION_CONFLICT/.test(message)) return "Cette section a changé sur le serveur. Comparez les informations avant d’enregistrer.";
  if (/BIO_TOO_LONG/.test(message))
    return "Votre présentation doit contenir au maximum 4 000 caractères.";
  if (/BIO_CONFIRMATION_PENDING/.test(message))
    return "L’enregistrement n’a pas pu être confirmé. Actualisez votre profil avant de réessayer.";
  if (
    /PRICING_CHANGE_AUTHORITY_REQUIRED|ENTERPRISE_QUOTE_AUTHORITY_REQUIRED|REQUEST_NOT_QUOTABLE/.test(
      message,
    )
  )
    return "Cette demande suit un autre parcours de prix. Aucun devis n’a été transmis.";
  if (/PDF_SHARING_UNAVAILABLE/.test(message)) return 'Le partage de fichiers est indisponible sur cet appareil.';
  if (/PDF_INVALID/.test(message)) return 'Le document n’a pas pu être généré. Réessayez.';
  if (/LEDGER_CLIENT_MISMATCH/.test(message)) return "Le client doit correspondre à l’intervention sélectionnée.";
  if (/LEDGER_|JOB_INVALID/.test(message)) return "Vérifiez le montant, la date et l’intervention sélectionnée.";
  if (/QUOTE_VERSION_CONFLICT|QUOTE_VERSION_REQUIRED/.test(message)) return "Une autre version de ce devis existe. Vos modifications sont conservées ; comparez les versions avant de continuer.";
  if (/QUOTE_STATE_CHANGED/.test(message)) return "Le statut de ce devis a changé. Actualisez-le avant de continuer.";
  if (/QUOTE_|INVALID_PRICE|INVALID_SCOPE/i.test(message))
    return "Vérifiez les lignes, les montants et la validité du devis.";
  return "Le service est momentanément indisponible. Vérifiez votre connexion puis réessayez.";
}
