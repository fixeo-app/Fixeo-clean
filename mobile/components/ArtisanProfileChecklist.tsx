import type { ArtisanProfile } from '@/lib/artisanOS';
import { profileMissingMessage } from '@/lib/artisanProfileGate';
import { ArtisanSection } from './ArtisanEditorial';
import { FixeoText } from '@/ui/FixeoText';

export function ArtisanProfileChecklist({ profile }: { profile: ArtisanProfile }) {
  const gate = profile.profile_gate;
  if (!gate) return <FixeoText tone="secondary">Vérification du profil indisponible. Actualisez votre espace.</FixeoText>;
  const checks: [string, boolean, boolean][] = [
    ['Nom professionnel', gate.checks.full_name, true],
    ['Téléphone', gate.checks.phone, false],
    ['Métier(s)', gate.checks.service_category, true],
    ['Ville / zone', gate.checks.city, true],
    ['Présentation', gate.checks.description, false],
    ['Approbation FIXEO', gate.checks.approval, true],
  ];
  return <ArtisanSection label="VOTRE PROFIL, EN CLAIR" testID="artisan-profile-checklist">
    <FixeoText variant="heading" accessibilityLiveRegion="polite">{gate.complete ? 'Votre profil est prêt.' : profileMissingMessage(gate.missing_fields)}</FixeoText>
    {checks.map(([label, present, required]) => <FixeoText key={label} tone="secondary">
      {present ? '✓' : '○'} {label}{!present ? required ? ' · à compléter' : ' · facultatif, conseillé' : ''}
    </FixeoText>)}
    <FixeoText variant="supporting" tone="secondary">{gate.complete ? 'Vous pouvez choisir votre disponibilité. La vérification FIXEO et l’attribution des missions restent distinctes.' : 'Complétez les éléments indiqués, puis actualisez votre disponibilité.'}</FixeoText>
  </ArtisanSection>;
}
