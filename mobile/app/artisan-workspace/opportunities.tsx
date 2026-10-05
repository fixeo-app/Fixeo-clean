import { View } from "react-native";
import { router } from "expo-router";
import { getDispatchOffers } from "@/lib/magicLoop";
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
const load = getDispatchOffers;
export default function Opportunities() {
  const q = useArtisanQuery(load);
  return (
    <ArtisanPage
      title="La prochaine rencontre."
      eyebrow="OPPORTUNITÉS FIXEO"
      detail="Les demandes qui vous sont proposées, au bon endroit."
      activeKey="opportunities"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage message={q.error} retry={() => void q.reload()} />
      <ArtisanCue text="Le premier artisan éligible qui accepte remporte la mission. Vérifiez votre disponibilité avant de vous engager." />
      {q.data?.map((o) => (
        <View style={art.row} key={o.request_id}>
          <FixeoText variant="eyebrow" tone="secondary">
            {o.queue_status === "CONTACTED"
              ? "VOUS AVEZ ÉTÉ CONTACTÉ"
              : "NOUVELLE PROPOSITION"}
          </FixeoText>
          <FixeoText variant="title">
            {o.service_category || "Demande FIXEO"}
          </FixeoText>
          <FixeoText tone="secondary">
            {o.city || "Ville non renseignée"}
            {o.urgency ? ` · Urgence déclarée : ${o.urgency}` : ""}
          </FixeoText>
          <FixeoAction
            label="Lire l’opportunité"
            onPress={() =>
              router.push({
                pathname: "/artisan-workspace/opportunity/[id]" as any,
                params: { id: o.request_id },
              })
            }
          />
        </View>
      ))}
      {q.data?.length === 0 && (
        <ArtisanEmpty
          title="Vous êtes en veille."
          detail="Les prochaines demandes proposées par FIXEO apparaîtront ici."
          action="Gérer ma disponibilité"
          onPress={() => router.push("/artisan-workspace")}
        />
      )}
    </ArtisanPage>
  );
}
