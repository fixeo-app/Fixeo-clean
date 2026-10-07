import { View } from "react-native";
import { router } from "expo-router";
import { loadArtisanMissions } from "@/lib/artisanOS";
import { businessStatus, when } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanCue,
  ArtisanEmpty,
  ArtisanMessage,
  useArtisanQuery,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
export default function Missions() {
  const q = useArtisanQuery(loadArtisanMissions);
  return (
    <ArtisanPage
      title="Votre travail, suivi."
      eyebrow="MISSIONS FIXEO"
      activeKey="missions"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanCue title="RAFI · Suivre votre mission" text="Retrouvez chaque mission et sa prochaine étape, de l’acceptation à la validation." />
      <ArtisanMessage message={q.error} retry={() => void q.reload()} />
      {q.data?.map((m) => (
        <View style={art.row} key={m.mission_id}>
          <FixeoText variant="eyebrow" tone="secondary">
            {businessStatus[m.request_status] || m.request_status}
          </FixeoText>
          <FixeoText variant="title">
            {m.service_category || "Mission FIXEO"}
          </FixeoText>
          <FixeoText tone="secondary">
            {m.city} · {when(m.accepted_at)}
          </FixeoText>
          <FixeoAction
            label="Ouvrir cette mission"
            onPress={() =>
              router.push({
                pathname: "/mission/[id]",
                params: { id: m.mission_id },
              })
            }
          />
        </View>
      ))}
      {q.data?.length === 0 && (
        <ArtisanEmpty
          title="Votre journée est libre."
          detail="Vos missions apparaîtront ici après acceptation d’une opportunité."
          action="Voir les opportunités"
          onPress={() => router.push("/artisan-workspace/opportunities" as any)}
        />
      )}
    </ArtisanPage>
  );
}
