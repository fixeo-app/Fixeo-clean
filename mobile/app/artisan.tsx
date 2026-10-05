import { View } from "react-native";
import { router } from "expo-router";
import { useArtisanHome } from "@/lib/useArtisanHome";
import {
  availabilityLabels,
  artisanError,
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
  ArtisanModuleStatus,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
import { RafiOrb } from "@/ui/RafiOrb";
import type { ContextDockSpec } from "@/ui/shellContract";

export default function ArtisanHome() {
  const q = useArtisanHome(),
    d = q.data;
  const offers = d?.offers,
    mission = d?.mission;
  const awaitingClient = mission?.request_status === "completed";
  const today = d?.jobs;
  const draft = d?.quotes?.find((x) => x.status === "draft");
  const next = awaitingClient
    ? "Le relais est au client."
    : mission
      ? "Votre mission vous attend."
      : offers?.length
        ? "Une opportunité pour vous."
        : today?.length
          ? "Votre prochaine intervention."
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
      loading={false}
      onRefresh={() => void q.reload()}
      dock={dock}
    >
      <View testID="home-identity">
        <FixeoText variant="heading">
          {d?.profile?.name || "Votre espace Artisan"}
        </FixeoText>
      </View>
      {q.authority.status === "loading" && (
        <FixeoText tone="secondary">
          Vérification de votre accès sécurisé…
        </FixeoText>
      )}
      {q.authority.status === "unavailable" && (
        <ArtisanMessage
          message={artisanError(q.authority.error)}
          retry={() => void q.reload()}
        />
      )}
      <>
        <View
          testID="home-rafi"
          style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
        >
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
            {d && (
              <FixeoAction
                label="Parler avec RAFI"
                variant="ghost"
                onPress={() => router.push("/artisan-workspace/rafi" as any)}
              />
            )}
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
                  : "VOTRE PROCHAINE ACTION"
          }
          dark
          testID="artisan-priority"
        >
          <FixeoText variant="title" tone="inverse">
            {mission
              ? mission.service_category || "Mission FIXEO"
              : offers?.length
                ? offers[0].service_category || "Nouvelle demande"
                : today?.length
                  ? today[0].title
                  : "Préparez votre journée."}
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
                : today?.length
                  ? when(today[0].scheduled_at)
                  : "Votre agenda et vos outils restent disponibles pendant l’actualisation."}
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
                    : "Ouvrir mon agenda"
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
                  : router.push("/artisan-workspace/agenda")
            }
          />
        </ArtisanSection>
        {(
          [
            ["mission", "Mission"],
            ["offers", "Opportunités"],
          ] as const
        ).map(([key, label]) => (
          <ArtisanModuleStatus
            key={key}
            label={label}
            state={d ? q.modules[key] : { status: "loading", error: null }}
            retry={() => void q.retry(key)}
            testID={`home-${key}`}
          />
        ))}
        <ArtisanCue
          text={
            draft
              ? `Le devis « ${draft.title} » est encore en brouillon. Vous pouvez le finaliser.`
              : today?.length
                ? "Retrouvez vos prochaines interventions personnelles dans votre agenda."
                : "Votre activité se précise au fil des informations reçues."
          }
        />
        <ArtisanModuleStatus
          label="Devis"
          state={d ? q.modules.quotes : { status: "loading", error: null }}
          retry={() => void q.retry("quotes")}
          testID="home-quotes"
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
          <FixeoText variant="heading">Prochaines interventions</FixeoText>
          <ArtisanModuleStatus
            label="Agenda"
            state={d ? q.modules.jobs : { status: "loading", error: null }}
            retry={() => void q.retry("jobs")}
            testID="home-jobs"
          />
          {today?.length
            ? today.slice(0, 2).map((j) => (
                <View key={j.id} style={art.row}>
                  <FixeoText variant="bodyLarge">{j.title}</FixeoText>
                  <FixeoText tone="secondary">{when(j.scheduled_at)}</FixeoText>
                </View>
              ))
            : today && (
                <FixeoText style={{ marginTop: 12 }} tone="secondary">
                  Aucune prochaine intervention personnelle planifiée.
                </FixeoText>
              )}
          <FixeoAction
            label="Voir ma journée"
            variant="ghost"
            onPress={() => router.push("/artisan-workspace/agenda")}
          />
        </View>
        <ArtisanSection label="MOUVEMENTS PERSONNELS · AUJOURD’HUI">
          <ArtisanModuleStatus
            label="Finances"
            state={d ? q.modules.ledger : { status: "loading", error: null }}
            retry={() => void q.retry("ledger")}
            testID="home-ledger"
          />
          {totals && (
            <FixeoText variant="title">{money(totals.income)}</FixeoText>
          )}
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
        <ArtisanSection label="VOTRE PROFIL">
          <ArtisanModuleStatus
            label="Profil"
            state={d ? q.modules.profile : { status: "loading", error: null }}
            retry={() => void q.retry("profile")}
            testID="home-profile"
          />
          {d?.profile && (
            <FixeoText>
              {availabilityLabels[d.profile.availability] ||
                "Disponibilité à définir"}
            </FixeoText>
          )}
          <FixeoAction
            label="Gérer ma disponibilité"
            variant="ghost"
            onPress={() => router.push("/artisan-workspace")}
          />
        </ArtisanSection>
        <View style={art.actions}>
          <FixeoText variant="heading">Vos outils, à portée de main.</FixeoText>
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
    </ArtisanPage>
  );
}
