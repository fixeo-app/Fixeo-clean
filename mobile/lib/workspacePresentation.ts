export function isTechnicalDisplayName(value: string | null | undefined) {
  const name = String(value || '').trim();
  if (!name) return true;
  return /synthetic|staging|mobile[_\s-]?(client|artisan)|fixture|test[_\s-]?user/i.test(name)
    || (name.includes('_') && name === name.toUpperCase());
}

export function clientGreetingName(value: string | null | undefined) {
  const name = String(value || '').trim();
  if (isTechnicalDisplayName(name)) return null;
  return name.split(/\s+/)[0] || null;
}

export function clientProfileTitle(value: string | null | undefined) {
  const name = String(value || '').trim();
  return isTechnicalDisplayName(name) ? 'Votre profil FIXEO' : name;
}

export function formatWorkspaceDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function cleanNotificationCopy(value: string | null | undefined) {
  return String(value || '')
    .replace(/\s*#[A-F0-9]{6,}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

export function isTechnicalRequestContent(input: {
  service_category?: string | null;
  description?: string | null;
}) {
  const value = `${input.service_category || ''} ${input.description || ''}`;
  return /synthetic|fixture|test\s*r[eé]seau|mobile[_\s-]?staging/i.test(value);
}
