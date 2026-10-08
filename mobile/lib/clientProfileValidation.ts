import { canonicalCity } from './clientLocation';

export function clientProfileErrors(phone: string, city: string) {
  const compact = phone.replace(/[\s().-]/g, '');
  return {
    phone: !compact ? 'Indiquez un téléphone pour être joignable.' : /^(?:0|\+212|00212)[5-7]\d{8}$/.test(compact) ? '' : 'Indiquez un numéro marocain valide, par exemple 06 suivi de 8 chiffres.',
    city: !city.trim() ? 'Choisissez votre ville de profil.' : canonicalCity(city) ? '' : 'Choisissez une ville proposée par FIXEO.',
  };
}
