import { View } from "react-native";
import { router } from "expo-router";
import { loadBusinessQuotes, loadMarketplaceQuotes } from "@/lib/artisanOS";
import { businessStatus, money } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanCue,
  ArtisanEmpty,
  ArtisanMessage,
  ArtisanSection,
  useArtisanQuery,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
const load = async () => {
  const [personal, marketplace] = await Promise.all([
    loadBusinessQuotes(),
    loadMarketplaceQuotes(),
  ]);
  return { personal, marketplace };
};
export default function Quotes() {
  const q = useArtisanQuery(load);
  return (
    <ArtisanPage
      title="Le travail bien préparé."
      eyebrow="DEVIS STUDIO"
      detail="Votre savoir-faire, présenté avec clarté."
      activeKey="quotes"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage message={q.error} retry={() => void q.reload()} />
      <FixeoAction
        label="Nouveau devis"
        onPress={() => router.push("/artisan-workspace/quote/new" as any)}
      />
      <ArtisanCue text="Séparez les prestations, les fournitures et la main-d’œuvre. Vous renseignez les prix ; RAFI vous aide à organiser le devis." />
      {q.data && (
        <>
          <ArtisanSection label="VOS CLIENTS PERSONNELS">
            {q.data.personal.length ? (
              q.data.personal.map((x) => (
                <View style={art.row} key={x.id}>
                  <FixeoText variant="eyebrow" tone="secondary">
                    {x.quote_number} · {businessStatus[x.status] || x.status}
                  </FixeoText>
                  <FixeoText variant="heading">{x.title}</FixeoText>
                  <FixeoText>{money(x.total)}</FixeoText>
                  <FixeoAction
                    label="Ouvrir ce devis"
                    variant="ghost"
                    onPress={() =>
                      router.push({
                        pathname: "/artisan-workspace/quote/[id]" as any,
                        params: { id: x.id },
                      })
                    }
                  />
                </View>
              ))
            ) : (
              <ArtisanEmpty
                title="Votre premier devis commence ici."
                detail="Ajoutez les lignes et choisissez un client pour préparer votre document."
              />
            )}
          </ArtisanSection>
          <ArtisanSection label="DEVIS FIXEO">
            {q.data.marketplace.length ? (
              q.data.marketplace.map((x) => (
                <View style={art.row} key={x.id}>
                  <FixeoText variant="heading">
                    {money(x.proposed_price)}
                  </FixeoText>
                  <FixeoText>{x.service_description}</FixeoText>
                  <FixeoText tone="secondary">
                    {businessStatus[x.review_status] || x.review_status} ·
                    Version {x.quote_version}
                  </FixeoText>
                </View>
              ))
            ) : (
              <FixeoText tone="secondary">
                Vos propositions liées aux opportunités FIXEO apparaîtront ici
                après transmission.
              </FixeoText>
            )}
          </ArtisanSection>
        </>
      )}
    </ArtisanPage>
  );
}
