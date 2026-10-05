import { View } from "react-native";
import { router } from "expo-router";
import { loadArtisanHome } from "@/lib/artisanOS";
import {
  availabilityLabels,
  businessStatus,
  ledgerTotals,
  localDay,
  money,
  when,
} from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanEmpty,
  ArtisanMessage,
  useArtisanQuery,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
import { RafiOrb } from "@/ui/RafiOrb";
import type { ContextDockSpec } from "@/ui/shellContract";

export default function ArtisanHome() {
  const q = useArtisanQuery(loadArtisanHome),
    d = q.data;
  const offers = d?.offers,
    mission = d?.mission;
  const awaitingClient = mission?.request_status === "completed";
  const today = d?.jobs
    ?.filter(
      (j) =>
        j.scheduled_at &&
        localDay(j.scheduled_at) === localDay() &&
        !["completed", "cancelled"].includes(j.status),
    )
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  const draft = d?.quotes?.find((x) => x.status === "draft");
  const next = awaitingClient
    ? "Le relais est au client."
    : mission
      ? "Votre mission vous attend."
      : offers?.length
        ? "Une opportunité pour vous."
        : "Votre journée, en confiance.";
  const dock: ContextDockSpec = {
    universe: "artisan",
    items: [
      {
        key: "offers",
        label: "Opportunités",
        icon: "flash-outline",
        accessibilityLabel: "Voir les opportunités",
        badge: offers?.length,
        action: () => router.push("/artisan-workspace/opportunities" as any),
      },
      {
        key: "rafi",
        label: "RAFI",
        icon: "sparkles-outline",
        accessibilityLabel: "Ouvrir RAFI Artisan",
        action: () => router.push("/artisan-workspace/rafi" as any),
      },
      {
        key: "agenda",
        label: "Agenda",
        icon: "calendar-outline",
        accessibilityLabel: "Ouvrir mon agenda",
        action: () => router.push("/artisan-workspace/agenda"),
      },
    ],
  };
  const totals = d?.ledger ? ledgerTotals(d.ledger, localDay()) : null;
  return (
    <ArtisanPage
      title={next}
      eyebrow="FIXEO · VOTRE QUOTIDIEN PRO"
      detail="L’essentiel pour décider. L’espace pour bien travailler."
      activeKey="cockpit"
      back={false}
      loading={q.loading}
      onRefresh={() => void q.reload()}
      dock={dock}
    >
      <ArtisanMessage message={q.error} retry={() => void q.reload()} />
      {d && (
        <>
          {d.partial && (
            <ArtisanMessage
              message="Une partie de l’activité n’a pas pu être actualisée."
              retry={() => void q.reload()}
            />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <RafiOrb mode={mission ? "working" : "idle"} size={76} />
            <View style={art.flex}>
              <FixeoText variant="eyebrow">RAFI EST À VOS CÔTÉS</FixeoText>
              <FixeoText tone="secondary">
                {awaitingClient
                  ? "Votre travail est terminé. Suivez la validation du client."
                  : mission
                    ? "Gardez le cap sur votre intervention."
                    : offers?.length
                      ? "Une demande vous a été proposée par FIXEO."
                      : today?.length
                        ? `Votre prochaine intervention : ${when(today[0].scheduled_at)}.`
                        : "Préparez votre activité et votre prochaine intervention."}
              </FixeoText>
            </View>
          </View>
          <ArtisanSection
            label={
              awaitingClient
                ? "SUIVI DE VOTRE MISSION"
                : mission
                  ? "À FAIRE MAINTENANT"
                  : offers?.length
                    ? "PROCHAINE OPPORTUNITÉ"
                    : "VOTRE DISPONIBILITÉ"
            }
            dark
            testID="artisan-priority"
          >
            <FixeoText variant="title" tone="inverse">
              {mission
                ? mission.service_category || "Mission FIXEO"
                : offers?.length
                  ? offers[0].service_category || "Nouvelle demande"
                  : availabilityLabels[d.profile?.availability || ""] ||
                    "À définir"}
            </FixeoText>
            <FixeoText tone="inverseSecondary">
              {mission
                ? [
                    mission.city,
                    businessStatus[mission.request_status] ||
                      mission.request_status,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : offers?.length
                  ? `${offers[0].city || "Ville à préciser"} · Proposition FIXEO`
                  : "Votre statut permet à FIXEO de connaître votre disponibilité."}
            </FixeoText>
            <FixeoAction
              variant="secondary"
              label={
                awaitingClient
                  ? "Suivre la validation"
                  : mission
                    ? "Reprendre ma mission"
                    : offers?.length
                      ? "Voir cette opportunité"
                      : "Gérer ma disponibilité"
              }
              onPress={() =>
                mission
                  ? router.push({
                      pathname: "/mission/[id]",
                      params: { id: mission.mission_id },
                    })
                  : offers?.length
                    ? router.push({
                        pathname: "/artisan-workspace/opportunity/[id]" as any,
                        params: { id: offers[0].request_id },
                      })
                    : router.push("/artisan-workspace")
              }
            />
          </ArtisanSection>
          <ArtisanCue
            text={
              draft
                ? `Le devis « ${draft.title} » est encore en brouillon. Vous pouvez le finaliser.`
                : today?.length
                  ? `Vous avez ${today.length} intervention${today.length > 1 ? "s" : ""} personnelle${today.length > 1 ? "s" : ""} aujourd’hui.`
                  : "Vos indicateurs seront enrichis à mesure que votre activité est renseignée."
            }
          />
          {draft && (
            <FixeoAction
              label="Reprendre mon devis"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/artisan-workspace/quote/[id]" as any,
                  params: { id: draft.id },
                })
              }
            />
          )}
          <View>
            <FixeoText variant="heading">Aujourd’hui</FixeoText>
            {today?.length ? (
              today.slice(0, 2).map((j) => (
                <View key={j.id} style={art.row}>
                  <FixeoText variant="bodyLarge">{j.title}</FixeoText>
                  <FixeoText tone="secondary">{when(j.scheduled_at)}</FixeoText>
                </View>
              ))
            ) : (
              <FixeoText style={{ marginTop: 12 }} tone="secondary">
                {today
                  ? "Aucune intervention personnelle planifiée aujourd’hui."
                  : "Agenda indisponible pour le moment."}
              </FixeoText>
            )}
            <FixeoAction
              label="Voir ma journée"
              variant="ghost"
              onPress={() => router.push("/artisan-workspace/agenda")}
            />
          </View>
          <ArtisanSection label="MOUVEMENTS PERSONNELS · AUJOURD’HUI">
            <FixeoText variant="title">
              {totals ? money(totals.income) : "Non disponible"}
            </FixeoText>
            <FixeoText tone="secondary">
              Encaissements enregistrés
              {totals ? ` · Dépenses : ${money(totals.expense)}` : ""}
            </FixeoText>
            <FixeoAction
              label="Ouvrir mes finances"
              variant="ghost"
              onPress={() => router.push("/artisan-workspace/finance")}
            />
          </ArtisanSection>
          <View style={art.actions}>
            <FixeoText variant="heading">
              Vos outils, à portée de main.
            </FixeoText>
            <FixeoAction
              label="Créer un devis"
              variant="secondary"
              onPress={() => router.push("/artisan-workspace/quotes")}
            />
            <FixeoAction
              label="Mon carnet clients"
              variant="ghost"
              onPress={() => router.push("/artisan-workspace/clients")}
            />
          </View>
          {!offers?.length && offers && (
            <ArtisanEmpty
              title="Aucune opportunité à traiter."
              detail="Vous retrouverez ici les demandes que FIXEO vous propose. Vérifiez votre disponibilité et vos zones."
            />
          )}
        </>
      )}
    </ArtisanPage>
  );
}
