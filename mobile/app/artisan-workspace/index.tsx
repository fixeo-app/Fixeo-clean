import { useEffect, useState } from 'react';
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
  const [confirmed, setConfirmed] = useState<string | null>(null);
  useEffect(() => { setConfirmed(null); }, [q.data]);
  const currentStatus = confirmed || q.data?.availability;
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
              {availabilityLabels[currentStatus || ''] || "À définir"}
            </FixeoText>
          </ArtisanSection>
          <ArtisanCue text="Choisissez le statut qui correspond à votre situation. FIXEO garde la décision d’attribution de chaque mission." />
          {Object.entries(availabilityLabels).map(([value, label]) => (
            <FixeoAction
              key={value}
              label={label}
              variant={value === currentStatus ? "primary" : "secondary"}
              disabled={a.busy || value === currentStatus}
              busy={a.busy && value !== currentStatus} busyLabel="Enregistrement…"
              accessibilityState={{ selected: value === currentStatus }}
              onPress={() =>
                void a.run(async () => {
                  const status = await setArtisanAvailability(value as ArtisanAvailability);
                  setConfirmed(status);
                  await q.reload();
                  return true;
                }, "Disponibilité enregistrée.")
              }
            />
          ))}
          <ArtisanMessage message={a.message} />
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
