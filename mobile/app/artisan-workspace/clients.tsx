import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { loadBusinessClients } from "@/lib/artisanOS";
import {
  ArtisanPage,
  ArtisanField,
  ArtisanEmpty,
  ArtisanMessage,
  ArtisanCue,
  useArtisanQuery,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
export default function Clients() {
  const q = useArtisanQuery(loadBusinessClients),
    [search, setSearch] = useState("");
  const rows = q.data?.filter((c) =>
    `${c.full_name} ${c.phone || ""} ${c.city || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <ArtisanPage
      title="Les relations qui comptent."
      eyebrow="VOTRE CARNET CLIENTS"
      detail="Coordonnées, devis et interventions au même endroit."
      activeKey="clients"
      loading={q.loading}
      onRefresh={() => void q.reload()}
      list={{ data: rows || [], keyExtractor: c => c.id, renderItem: ({ item: c }) => (
        <View key={c.id} style={art.row}>
          <FixeoText variant="heading">{c.full_name}</FixeoText>
          <FixeoText tone="secondary">
            {[c.phone, c.city].filter(Boolean).join(" · ") ||
              "Coordonnées à compléter"}
          </FixeoText>
          <FixeoAction
            label={`Ouvrir ${c.full_name}`}
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: "/artisan-workspace/client/[id]" as any,
                params: { id: c.id },
              })
            }
          />
        </View>
      ) }}
    >
      <ArtisanMessage message={q.error} retry={() => void q.reload()} />
      <FixeoAction
        label="Ajouter un client"
        onPress={() => router.push("/artisan-workspace/client/new" as any)}
      />
      <ArtisanField
        label="Rechercher un client"
        value={search}
        onChangeText={setSearch}
      />
      <ArtisanCue text="Ouvrez une fiche pour retrouver l’historique personnel renseigné et préparer la prochaine intervention." />

      {rows?.length === 0 && (
        <ArtisanEmpty
          title={search ? "Aucun résultat." : "Votre carnet commence ici."}
          detail={
            search
              ? "Essayez un autre nom ou numéro."
              : "Ajoutez votre premier client personnel pour préparer ses devis et interventions."
          }
        />
      )}
    </ArtisanPage>
  );
}
