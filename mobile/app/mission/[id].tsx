import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  completeMission,
  getArtisanMissionDetail,
  getMissionTimeline,
  markMissionArrived,
  startMission,
} from "@/lib/missionTerrain";
import { listMissionEvidence } from "@/lib/missionEvidence";
import { getMissionChange, submitMissionChange } from "@/lib/missionChange";
import { getTerrainGuidance } from "@/lib/rafiTerrain";
import { businessStatus, money, when } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanField,
  ArtisanMessage,
  useArtisanQuery,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { MissionEvidenceCapture } from "@/components/MissionEvidenceCapture";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
import type { ContextDockSpec } from "@/ui/shellContract";
export default function MissionTerrain() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    a = useArtisanAction();
  const q = useArtisanQuery(
    useCallback(async () => {
      // Each endpoint checks canonical role/session and ownership server-side.
      const [mission, timeline, evidence, change] = await Promise.all([
        getArtisanMissionDetail(id),
        getMissionTimeline(id),
        listMissionEvidence(id),
        getMissionChange(id),
      ]);
      return { mission, timeline, evidence, change };
    }, [id]),
  );
  const [changeOpen, setChangeOpen] = useState(false),
    [price, setPrice] = useState(""),
    [reason, setReason] = useState(""),
    [supplies, setSupplies] = useState(""),
    [duration, setDuration] = useState(""),
    [confirm, setConfirm] = useState(false);
  const d = q.data,
    m = d?.mission,
    status = m?.request_status,
    arrived = d?.timeline.some(
      (e: { event_type: string }) => e.event_type === "arrived",
    );
  const guidance = getTerrainGuidance(m?.service_category);
  const label =
    status === "assigned"
      ? arrived
        ? "Démarrer l’intervention"
        : "Je suis arrivé"
      : status === "in_progress"
        ? "Terminer l’intervention"
        : status === "completed"
          ? "En attente du client"
          : "Mission clôturée";
  const action = async () => {
    if (!m) return;
    if (status === "in_progress" && !confirm) {
      setConfirm(true);
      return;
    }
    await a.run(async () => {
      if (status === "assigned") {
        if (arrived) await startMission(id);
        else await markMissionArrived(id);
      } else if (status === "in_progress") await completeMission(id);
      setConfirm(false);
      await q.reload();
      return true;
    }, "État de la mission enregistré.");
  };
  const call = () => {
    if (m?.client_phone)
      void Linking.openURL(
        "tel:" + m.client_phone.replace(/[^+\d]/g, ""),
      ).catch(() => a.setMessage("Impossible d’ouvrir l’appel."));
  };
  const dock: ContextDockSpec = {
    universe: "artisan",
    hidden: !m,
    items: [
      {
        key: "client",
        label: "Client",
        icon: "call-outline",
        accessibilityLabel: "Appeler le client de la mission",
        disabled: !m?.client_phone,
        action: call,
      },
      {
        key: "proof",
        label: "Preuve",
        icon: "camera-outline",
        accessibilityLabel: "Ouvrir les preuves mission",
        action: () =>
          router.push({
            pathname: "/artisan-workspace/evidence/[id]" as any,
            params: { id },
          }),
      },
      {
        key: "action",
        label:
          status === "assigned"
            ? arrived
              ? "Démarrer"
              : "Arrivée"
            : status === "in_progress"
              ? "Terminer"
              : "Suivi",
        icon: "checkmark-outline",
        accessibilityLabel: label,
        disabled: a.busy || !["assigned", "in_progress"].includes(status || ""),
        action: () => void action(),
      },
    ],
  };
  return (
    <ArtisanPage
      title={
        status === "in_progress"
          ? "Concentré sur le terrain."
          : status === "completed"
            ? "Votre travail est terminé."
            : "La prochaine étape est claire."
      }
      eyebrow="MISSION FIXEO"
      activeKey="missions"
      loading={q.loading}
      onRefresh={() => void q.reload()}
      dock={dock}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {m && d && (
        <>
          <ArtisanSection
            label={businessStatus[status || ""] || "MISSION"}
            dark
          >
            <FixeoText variant="title" tone="inverse">
              {m.service_category || "Intervention FIXEO"}
            </FixeoText>
            <FixeoText tone="inverseSecondary">
              {m.city}
              {m.urgency ? ` · ${m.urgency}` : ""}
            </FixeoText>
            {m.description && (
              <FixeoText tone="inverse">{m.description}</FixeoText>
            )}
            {m.agreed_price != null && (
              <FixeoText variant="heading" tone="inverse">
                {money(m.agreed_price)} convenus
              </FixeoText>
            )}
          </ArtisanSection>
          <ArtisanCue
            text={
              status === "assigned"
                ? arrived
                  ? "Votre arrivée est enregistrée. Ajoutez l’état initial avant de commencer."
                  : "Confirmez votre arrivée lorsque vous êtes sur place."
                : status === "in_progress"
                  ? "Vérifiez vos preuves et les ajustements avant de demander la validation client."
                  : status === "completed"
                    ? "La validation appartient au client. Vous pouvez consulter les preuves transmises."
                    : "La mission est clôturée. Son historique reste disponible."
            }
          />
          {["assigned", "in_progress"].includes(status || "") && (
            <FixeoAction
              label={label}
              busy={a.busy}
              onPress={() => void action()}
            />
          )}
          {confirm && (
            <ArtisanSection label="CONFIRMER LA FIN D’INTERVENTION">
              <FixeoText>
                Les preuves et les ajustements sont-ils prêts ? FIXEO vérifiera
                l’état de la mission avant sa clôture.
              </FixeoText>
              <FixeoAction
                label="Confirmer la fin d’intervention"
                busy={a.busy}
                onPress={() => void action()}
              />
              <FixeoAction
                label="Revenir à l’intervention"
                variant="ghost"
                onPress={() => setConfirm(false)}
              />
            </ArtisanSection>
          )}
          <ArtisanSection label="VOTRE CLIENT">
            <FixeoText>{m.client_phone || "Contact non disponible"}</FixeoText>
            <FixeoText tone="secondary">
              Localisation disponible : {m.city || "non renseignée"}. Le
              rendez-vous précis n’est pas communiqué dans ce suivi.
            </FixeoText>
            <FixeoAction
              label="Appeler le client"
              variant="secondary"
              disabled={!m.client_phone}
              onPress={call}
            />
          </ArtisanSection>
          <ArtisanSection label="PRÉPARATION TERRAIN">
            <FixeoText variant="heading">{guidance.title}</FixeoText>
            {guidance.checks.map((c) => (
              <FixeoText key={c} tone="secondary">
                {c}
              </FixeoText>
            ))}
          </ArtisanSection>
          <ArtisanSection label="PREUVES DE L’INTERVENTION">
            <FixeoText>
              {d.evidence.filter((e) => e.kind === "before").length} avant ·{" "}
              {d.evidence.filter((e) => e.kind === "after").length} après
            </FixeoText>
            {["assigned", "in_progress"].includes(status || "") && (
              <MissionEvidenceCapture
                missionId={id}
                kind={status === "in_progress" ? "after" : "before"}
                label={
                  status === "in_progress"
                    ? "Photo après intervention"
                    : "Photo avant intervention"
                }
                onUploaded={() => void q.reload()}
              />
            )}
            <FixeoAction
              label="Voir toutes les preuves"
              variant="ghost"
              onPress={() =>
                router.push({
                  pathname: "/artisan-workspace/evidence/[id]" as any,
                  params: { id },
                })
              }
            />
          </ArtisanSection>
          {status === "in_progress" && (
            <>
              <FixeoAction
                label={
                  changeOpen ? "Fermer l’ajustement" : "Proposer un ajustement"
                }
                variant="secondary"
                onPress={() => setChangeOpen((v) => !v)}
              />
              {changeOpen && (
                <ArtisanSection label="À VÉRIFIER PAR FIXEO">
                  <ArtisanField
                    label="Nouveau montant proposé en MAD"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                  />
                  <ArtisanField
                    label="Raison de l’ajustement"
                    value={reason}
                    onChangeText={setReason}
                    multiline
                  />
                  <ArtisanField
                    label="Fournitures de l’ajustement"
                    value={supplies}
                    onChangeText={setSupplies}
                  />
                  <ArtisanField
                    label="Durée estimée de l’ajustement"
                    value={duration}
                    onChangeText={setDuration}
                  />
                  <FixeoAction
                    label="Transmettre l’ajustement à FIXEO"
                    busy={a.busy}
                    onPress={() => {
                      const n = Number(price.replace(",", "."));
                      if (
                        !Number.isFinite(n) ||
                        n <= 0 ||
                        reason.trim().length < 5
                      ) {
                        a.setMessage(
                          "Indiquez un montant positif et la raison de l’ajustement.",
                        );
                        return;
                      }
                      void a.run(async () => {
                        await submitMissionChange(
                          id,
                          n,
                          reason,
                          supplies,
                          duration,
                        );
                        setChangeOpen(false);
                        await q.reload();
                        return true;
                      }, "Ajustement transmis à FIXEO avant présentation au client.");
                    }}
                  />
                </ArtisanSection>
              )}
            </>
          )}
          {d.change && (
            <ArtisanSection label="AJUSTEMENT EN SUIVI">
              <FixeoText>{money(d.change.proposed_price)}</FixeoText>
              <FixeoText tone="secondary">
                {businessStatus[d.change.status] || d.change.status}
              </FixeoText>
            </ArtisanSection>
          )}
          <View>
            <FixeoText variant="heading">Le fil de l’intervention</FixeoText>
            {d.timeline.map(
              (
                e: { id?: string; event_type: string; created_at: string },
                i: number,
              ) => (
                <View key={e.id || i} style={art.row}>
                  <FixeoText>
                    {(
                      {
                        arrived: "Arrivée enregistrée",
                        started: "Intervention démarrée",
                        completed: "Intervention terminée",
                        validated: "Validation client",
                        accepted: "Mission acceptée",
                      } as Record<string, string>
                    )[e.event_type] || e.event_type}
                  </FixeoText>
                  <FixeoText tone="secondary">{when(e.created_at)}</FixeoText>
                </View>
              ),
            )}
          </View>
        </>
      )}
    </ArtisanPage>
  );
}
