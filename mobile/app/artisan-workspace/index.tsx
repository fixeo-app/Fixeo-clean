import { router } from "expo-router";
import { loadArtisanProfile } from "@/lib/artisanOS";
import {
  setArtisanAvailability,
  type ArtisanAvailability,
} from "@/lib/artisanWorkspace";
import { availabilityLabels } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanMessage,
  useArtisanQuery,
  useArtisanAction,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
export default function Availability() {
  const q = useArtisanQuery(loadArtisanProfile),
    a = useArtisanAction();
  return (
    <ArtisanPage
      rafi={a.rafi}
      title="À votre rythme."
      eyebrow="DISPONIBILITÉ"
      detail="Un statut clair pour organiser vos prochaines opportunités."
      activeKey="workspace"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {q.data && (
        <>
          <ArtisanSection label="VOTRE STATUT ACTUEL" dark>
            <FixeoText variant="title" tone="inverse">
              {availabilityLabels[q.data.availability] || "À définir"}
            </FixeoText>
          </ArtisanSection>
          <ArtisanCue text="Choisissez le statut qui correspond à votre situation. FIXEO garde la décision d’attribution de chaque mission." />
          {Object.entries(availabilityLabels).map(([value, label]) => (
            <FixeoAction
              key={value}
              label={label}
              variant={value === q.data?.availability ? "primary" : "secondary"}
              disabled={a.busy}
              accessibilityState={{ selected: value === q.data?.availability }}
              onPress={() =>
                void a.run(async () => {
                  await setArtisanAvailability(value as ArtisanAvailability);
                  await q.reload();
                  return true;
                }, "Disponibilité enregistrée.")
              }
            />
          ))}
          <FixeoText tone="secondary">
            Votre prochain créneau n’est pas encore renseigné par le système.
          </FixeoText>
          <FixeoAction
            label="Ouvrir mon profil"
            variant="ghost"
            onPress={() => router.push("/artisan-workspace/profile" as any)}
          />
        </>
      )}
    </ArtisanPage>
  );
}
