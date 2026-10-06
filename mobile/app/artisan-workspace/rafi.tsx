import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useArtisanHome } from "@/lib/useArtisanHome";
import { transcribeRafiVoice } from "@/lib/rafiGateway";
import {
  analyzeMobileDiagnosticPhoto,
  type MobileDiagnosticResult,
} from "@/lib/mobileDiagnostic";
import { businessStatus, when, artisanError } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanMessage,
  ArtisanField,
  ArtisanModuleStatus,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { RafiInputRail } from "@/components/RafiInputRail";
import { RafiOrb } from "@/ui/RafiOrb";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
export default function RafiArtisan() {
  const q = useArtisanHome(),
    a = useArtisanAction();
  const [text, setText] = useState(""),
    [write, setWrite] = useState(false),
    [listening, setListening] = useState(false),
    [photo, setPhoto] = useState<MobileDiagnosticResult | null>(null);
  const d = q.data;
  return (
    <ArtisanPage
      rafi={a.rafi}
      title="Un regard sur votre journée."
      eyebrow="RAFI · COPILOTE PROFESSIONNEL"
      activeKey="rafi"
      loading={q.authority.status === "loading"}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={
          q.authority.status === "unavailable"
            ? artisanError(q.authority.error)
            : a.message
        }
        retry={
          q.authority.status === "unavailable"
            ? () => void q.reload()
            : undefined
        }
      />
      <View style={{ alignItems: "center" }}>
        <RafiOrb
          mode={listening ? "listening" : a.rafi.mode} eventKey={a.rafi.eventKey}
          size={96}
        />
      </View>
      {d && (
        <>
          <RafiInputRail
            onListeningChange={setListening}
            onWrite={() => setWrite(true)}
            onVoiceReady={(uri) =>
              void a.run(async () => {
                const result = await transcribeRafiVoice(uri);
                setText(result);
                setWrite(true);
                return result;
              }, "Transcription prête à relire.")
            }
            onPhotoReady={(uri, mimeType) => {
              if (q.modules.profile.status !== "ready") {
                a.setMessage(
                  "Votre profil n’est pas encore disponible. Réessayez après son chargement.",
                );
                return;
              }
              if (!d.profile?.city) {
                a.setMessage(
                  "Renseignez votre ville dans le profil avant d’analyser une photo.",
                );
                return;
              }
              void a.run(async () => {
                const result = await analyzeMobileDiagnosticPhoto({
                  uri,
                  mimeType,
                  city: d.profile!.city,
                  description: text,
                });
                setPhoto(result);
                return result;
              }, "Lecture photo reçue.");
            }}
          />
          {write && (
            <ArtisanField
              label="Votre note pour RAFI"
              value={text}
              onChangeText={setText}
              multiline
            />
          )}
          {text && (
            <ArtisanSection label="VOTRE NOTE · À CONFIRMER">
              <FixeoText>{text}</FixeoText>
              <FixeoText tone="secondary">
                Cette note ne déclenche aucune action sur votre activité.
              </FixeoText>
            </ArtisanSection>
          )}
          {photo && (
            <ArtisanSection label="LECTURE PHOTO ÉPHÉMÈRE">
              <FixeoText variant="heading">
                {photo.problem?.value || "Lecture reçue"}
              </FixeoText>
              <FixeoText tone="secondary">{photo.indicative}</FixeoText>
              {photo.safety?.stop && (
                <FixeoText>
                  Signal de sécurité détecté. Interrompez l’intervention et
                  vérifiez les consignes appropriées.
                </FixeoText>
              )}
              {photo.facts?.map((f, i) => (
                <View key={i} style={art.row}>
                  <FixeoText variant="caption" tone="secondary">
                    {f.provenance === "observed"
                      ? "OBSERVÉ"
                      : f.provenance === "user_declared"
                        ? "DÉCLARÉ"
                        : "HYPOTHÈSE À VÉRIFIER"}
                  </FixeoText>
                  <FixeoText>{String(f.value)}</FixeoText>
                </View>
              ))}
              <FixeoText variant="supporting" tone="secondary">
                Cette lecture ne constitue pas une preuve mission. Ajoutez une
                preuve depuis la mission lorsque nécessaire.
              </FixeoText>
            </ArtisanSection>
          )}
          <ArtisanCue
            text={
              d.mission
                ? `Votre mission ${d.mission.service_category || "FIXEO"} est ${businessStatus[d.mission.request_status]?.toLowerCase() || d.mission.request_status}. Consultez les preuves avant la prochaine étape.`
                : d.offers?.length
                  ? `${d.offers.length} opportunité(s) vous sont proposées. Vérifiez votre disponibilité avant acceptation.`
                  : q.modules.mission.status === "ready" &&
                      q.modules.offers.status === "ready"
                    ? "Aucune mission active n’est remontée dans votre activité actuelle."
                    : "Votre contexte s’enrichit au fil des informations reçues."
            }
          />
          {d.mission && (
            <FixeoAction
              label="Reprendre ma mission"
              onPress={() =>
                router.push({
                  pathname: "/mission/[id]",
                  params: { id: d.mission!.mission_id },
                })
              }
            />
          )}
          {(
            [
              ["mission", "Mission"],
              ["offers", "Opportunités"],
              ["profile", "Profil"],
              ["jobs", "Agenda"],
              ["quotes", "Devis"],
            ] as const
          ).map(([key, label]) => (
            <ArtisanModuleStatus
              key={key}
              label={label}
              state={q.modules[key]}
              retry={() => void q.retry(key)}
            />
          ))}
          <ArtisanSection label="À PRÉPARER">
            {d.quotes
              ?.filter((x) => x.status === "draft")
              .slice(0, 3)
              .map((x) => (
                <FixeoText key={x.id}>
                  Le devis « {x.title} » est encore en brouillon.
                </FixeoText>
              ))}
            {d.jobs
              ?.filter((x) => x.status === "planned")
              .slice(0, 3)
              .map((x) => (
                <FixeoText key={x.id}>
                  {x.title} · {when(x.scheduled_at)}
                </FixeoText>
              ))}
            <FixeoAction
              label="Ouvrir Devis Studio"
              variant="secondary"
              onPress={() => router.push("/artisan-workspace/quotes")}
            />
            <FixeoAction
              label="Voir mon agenda"
              variant="ghost"
              onPress={() => router.push("/artisan-workspace/agenda")}
            />
          </ArtisanSection>
        </>
      )}
    </ArtisanPage>
  );
}
