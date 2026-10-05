import { useCallback } from "react";
import { Image, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { listMissionEvidence } from "@/lib/missionEvidence";
import { getArtisanMissionDetail } from "@/lib/missionTerrain";
import { when } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanMessage,
  ArtisanCue,
  useArtisanQuery,
  art,
} from "@/components/ArtisanEditorial";
import { MissionEvidenceCapture } from "@/components/MissionEvidenceCapture";
import { FixeoText } from "@/ui/FixeoText";
export default function Evidence() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useArtisanQuery(
    useCallback(async () => {
      const [mission, evidence] = await Promise.all([
        getArtisanMissionDetail(id),
        listMissionEvidence(id),
      ]);
      return { mission, evidence };
    }, [id]),
  );
  const d = q.data;
  return (
    <ArtisanPage
      title="Le travail, en images."
      eyebrow="PREUVES MISSION"
      activeKey="missions"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage message={q.error} retry={() => void q.reload()} />
      <ArtisanCue text="Documentez l’état avant et après l’intervention. Une preuve n’est confirmée qu’après son enregistrement par FIXEO." />
      {d && (
        <>
          {["assigned", "in_progress"].includes(d.mission.request_status) && (
            <ArtisanSection label="ÉTAT INITIAL">
              <MissionEvidenceCapture
                missionId={id}
                kind="before"
                label="Ajouter une photo avant"
                onUploaded={() => void q.reload()}
              />
            </ArtisanSection>
          )}
          {d.mission.request_status === "in_progress" && (
            <ArtisanSection label="RÉSULTAT">
              <MissionEvidenceCapture
                missionId={id}
                kind="after"
                label="Ajouter une photo après"
                onUploaded={() => void q.reload()}
              />
            </ArtisanSection>
          )}
          {d.evidence.map((e) => (
            <View key={e.id} style={art.row}>
              <FixeoText variant="heading">
                {e.kind === "before"
                  ? "Avant intervention"
                  : "Après intervention"}
              </FixeoText>
              <FixeoText tone="secondary">
                {when(e.created_at)} · Enregistrée
              </FixeoText>
              {e.signed_url && (
                <Image
                  source={{ uri: e.signed_url }}
                  style={{ width: "100%", height: 220, borderRadius: 18 }}
                  resizeMode="cover"
                  accessibilityLabel={`Preuve ${e.kind === "before" ? "avant" : "après"}`}
                />
              )}
            </View>
          ))}
          {!d.evidence.length && (
            <FixeoText tone="secondary">
              Aucune preuve enregistrée pour cette mission.
            </FixeoText>
          )}
          <FixeoText variant="supporting" tone="secondary">
            Choisissez une photo nette de l’ensemble, puis un détail utile de
            votre intervention.
          </FixeoText>
        </>
      )}
    </ArtisanPage>
  );
}
