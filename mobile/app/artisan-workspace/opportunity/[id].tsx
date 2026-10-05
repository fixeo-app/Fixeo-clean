import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { acceptDispatchOffer, getDispatchOffers } from "@/lib/magicLoop";
import { when } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanMessage,
  ArtisanEmpty,
  useArtisanQuery,
  useArtisanAction,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
export default function Opportunity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useArtisanQuery(
    useCallback(async () => {
      return (
        (await getDispatchOffers()).find((o) => o.request_id === id) || null
      );
    }, [id]),
  );
  const a = useArtisanAction(),
    [confirm, setConfirm] = useState(false);
  const o = q.data;
  return (
    <ArtisanPage
      title={o?.service_category || "Votre opportunité."}
      eyebrow="PROPOSITION FIXEO"
      activeKey="opportunities"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {o ? (
        <>
          <ArtisanSection label="LE BESOIN CLIENT">
            <FixeoText variant="heading">
              {o.city || "Ville non renseignée"}
            </FixeoText>
            <FixeoText tone="secondary">
              Demande reçue {when(o.request_created_at)}
            </FixeoText>
            {o.urgency && <FixeoText>Urgence déclarée : {o.urgency}</FixeoText>}
            <FixeoText>
              Les précisions et le contact client seront disponibles après
              l’acceptation.
            </FixeoText>
          </ArtisanSection>
          <ArtisanCue text="FIXEO vous a proposé cette demande. Confirmez que vous êtes disponible ; l’attribution est vérifiée au moment de votre réponse." />
          {confirm ? (
            <ArtisanSection label="CONFIRMER VOTRE ENGAGEMENT">
              <FixeoText>
                Vous souhaitez prendre en charge cette demande ?
              </FixeoText>
              <FixeoAction
                label="Confirmer l’acceptation"
                busy={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    const result = await acceptDispatchOffer(o.request_id);
                    if (!result.mission_id)
                      throw new Error("MISSION_ID_MISSING");
                    router.replace({
                      pathname: "/mission/[id]",
                      params: { id: result.mission_id },
                    });
                    return result;
                  }, "Mission attribuée.")
                }
              />
              <FixeoAction
                label="Annuler"
                variant="ghost"
                disabled={a.busy}
                onPress={() => setConfirm(false)}
              />
            </ArtisanSection>
          ) : (
            <FixeoAction
              label="Accepter cette opportunité"
              onPress={() => setConfirm(true)}
            />
          )}
          <FixeoAction
            label="Préparer un devis FIXEO"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: "/artisan-workspace/quote/new" as any,
                params: { origin: "fixeo", requestId: o.request_id },
              })
            }
          />
          <FixeoAction
            label="Revenir aux opportunités"
            variant="ghost"
            onPress={() =>
              router.replace("/artisan-workspace/opportunities" as any)
            }
          />
        </>
      ) : (
        !q.loading &&
        !q.error && (
          <ArtisanEmpty
            title="Cette opportunité n’est plus disponible."
            detail="Une demande peut avoir été attribuée pendant votre consultation."
            action="Voir les opportunités"
            onPress={() =>
              router.replace("/artisan-workspace/opportunities" as any)
            }
          />
        )
      )}
    </ArtisanPage>
  );
}
