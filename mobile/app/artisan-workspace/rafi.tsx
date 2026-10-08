import { useRef, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { understandArtisanCommand, copilotReads, type CopilotCommand } from '@/lib/artisanCopilot';
import { loadBusinessClients, loadBusinessQuotes, loadBusinessJobs, loadLedger } from '@/lib/artisanOS';
import { setArtisanAvailability } from '@/lib/artisanWorkspace';
import { RafiPhotoPreview } from '@/components/RafiPhotoPreview';
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
  const [proposal, setProposal] = useState<CopilotCommand | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{uri:string;mimeType:string} | null>(null);
  const alive = useRef(true);
  const commandVersion = useRef(0);
  const consumed = useRef<CopilotCommand | null>(null);
  function consumeCommand() { consumed.current=proposal; ++commandVersion.current; setProposal(null); setText(''); setWrite(false); }
  useEffect(() => { const version=commandVersion; alive.current = true; return () => { alive.current = false; ++version.current; }; }, []);
  const d = q.data;
  async function understand(value: string) {
    const version=++commandVersion.current;
    const reads=copilotReads(value);
    const [clients,quotes,jobs,ledger] = await Promise.all([
      reads.clients ? loadBusinessClients().catch(() => null) : Promise.resolve(null),
      reads.quotes ? loadBusinessQuotes().catch(() => null) : Promise.resolve(null),
      reads.jobs ? loadBusinessJobs().catch(() => null) : Promise.resolve(null),
      reads.ledger ? loadLedger().catch(() => null) : Promise.resolve(null),
    ]);
    if (alive.current && version===commandVersion.current) setProposal(understandArtisanCommand(value, {clients, quotes, jobs, ledger}));
  }
  function choosePhoto(uri: string, mimeType = 'image/jpeg') {
    setSelectedPhoto({uri,mimeType}); setPhoto(null);
    a.setMessage('Photo prête. Vous décidez quand RAFI peut l’analyser.');
  }
  async function analyzePhoto() {
    if (!selectedPhoto || a.busy) return;
    if (!d?.profile?.city) { a.setMessage('Renseignez votre ville dans le profil avant l’analyse.'); return; }
    await a.run(async () => {
      const result = await analyzeMobileDiagnosticPhoto({...selectedPhoto, city:d.profile!.city, description:text});
      if (alive.current) setPhoto(result);
      return result;
    }, 'Lecture photo reçue.', 65000);
  }
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
                if (!alive.current) return;
                setText(result);
                setWrite(true);
                await understand(result);
                return result;
              }, "Commande prête à relire.")
            }
            onPhotoReady={choosePhoto}
          />
          {write && (
            <ArtisanField
              label="Votre note pour RAFI"
              value={text}
              editable={!a.busy}
              onChangeText={value => { ++commandVersion.current; setText(value); setProposal(null); setPhoto(null); }}
              multiline
            />
          )}
          {text && !(proposal?.kind === 'navigate' && proposal.readOnly) && (
            <ArtisanSection label="VOTRE NOTE · À CONFIRMER">
              <FixeoText>{text}</FixeoText>
              <FixeoAction label="Comprendre ma commande" disabled={a.busy || !text.trim()} onPress={() => void a.run(() => understand(text), 'Proposition prête.')} />
              <FixeoText tone="secondary">
                Cette note ne déclenche aucune action sur votre activité.
              </FixeoText>
            </ArtisanSection>
          )}
          {proposal && <ArtisanSection label={proposal.kind === 'navigate' && proposal.readOnly ? "RÉPONSE RAFI" : "PROPOSITION RAFI"}>
            <FixeoText>{proposal.message}</FixeoText>
            {proposal.kind !== 'unsupported' && <FixeoAction label={proposal.kind === 'availability' ? 'Confirmer le changement de statut' : proposal.kind === 'navigate' ? proposal.actionLabel || 'Ouvrir' : 'Ouvrir'} busy={a.busy}
              onPress={() => {
                if (consumed.current === proposal) return;
                const command = proposal;
                if (command.kind === 'navigate') { consumeCommand(); router.push({pathname:command.path,params:command.params} as any); }
                else if(command.kind === 'availability') void a.run(async () => { const status=await setArtisanAvailability(command.status); consumeCommand(); await q.retry('profile'); return status; }, 'Disponibilité confirmée.');
              }} />}
            <FixeoAction label="Annuler la proposition" variant="ghost" disabled={a.busy} onPress={consumeCommand} />
          </ArtisanSection>}
          {selectedPhoto && <ArtisanSection label="PHOTO PRIVÉE">
            <RafiPhotoPreview uri={selectedPhoto.uri} busy={a.busy} onChange={choosePhoto}
              onRemove={() => { setSelectedPhoto(null); setPhoto(null); }} onClarify={() => setWrite(true)} />
            {!photo && <FixeoAction label="Analyser la photo avec RAFI" busy={a.busy} onPress={() => void analyzePhoto()} />}
          </ArtisanSection>}
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
                  <FixeoText>{String(f.value || (f.provenance === 'user_declared' ? 'Aucun problème déclaré.' : 'Non précisé.'))}</FixeoText>
                </View>
              ))}
              <FixeoText variant="caption" tone="secondary">HYPOTHÈSE</FixeoText>
              <FixeoText>{photo.hypotheses.map(item => item.value).join('\n') || 'Aucune hypothèse établie.'}</FixeoText>
              <FixeoText variant="caption" tone="secondary">INCERTITUDE</FixeoText>
              <FixeoText>Une photo ne permet pas de confirmer une cause ou un défaut caché. Les hypothèses restent à vérifier sur place.</FixeoText>
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
