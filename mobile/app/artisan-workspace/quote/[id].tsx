import { validateQuote } from '@/lib/quoteValidation';
import { formatWorkspaceDate } from '@/lib/workspacePresentation';
import { QuoteBreakdown } from '@/components/QuoteBreakdown';
import { DateField } from '@/components/DateField';
import { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { getDispatchOffers } from "@/lib/magicLoop";
import {
  loadBusinessClients,
  loadBusinessQuotes,
  recordQuoteDecision,
  saveBusinessQuote,
  submitMarketplaceQuote,
} from "@/lib/artisanOS";
import {
  businessStatus,
  money,
  type QuoteLine,
} from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanMessage,
  ArtisanField,
  ArtisanChoices,
  useArtisanQuery,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
type Line = {
  type: QuoteLine["type"];
  label: string;
  quantity: string;
  price: string;
};
const blank = (): Line => ({
  type: "service",
  label: "",
  quantity: "1",
  price: "",
});
const load = async () => {
  const [clients, quotes, offers] = await Promise.all([
    loadBusinessClients(),
    loadBusinessQuotes(),
    getDispatchOffers(),
  ]);
  return { clients, quotes, offers };
};
export default function QuoteStudio() {
  const params = useLocalSearchParams<{
    id: string;
    origin?: string;
    clientId?: string;
    requestId?: string;
  }>();
  const fresh = params.id === "new",
    q = useArtisanQuery(load),
    a = useArtisanAction();
  const [section, setSection] = useState(0);
  const [newId] = useState(() => Crypto.randomUUID());
  const [origin, setOrigin] = useState(
      params.origin === "fixeo" ? "fixeo" : "personal",
    ),
    [clientId, setClientId] = useState(params.clientId || ""),
    [requestId, setRequestId] = useState(params.requestId || ""),
    [title, setTitle] = useState(""),
    [lines, setLines] = useState<Line[]>([blank()]),
    [discount, setDiscount] = useState(""),
    [notes, setNotes] = useState(""),
    [validity, setValidity] = useState(""),
    [duration, setDuration] = useState(""),
    [preview, setPreview] = useState(!fresh),
    [confirmation, setConfirmation] = useState<
      "sent" | "accepted" | "rejected" | "marketplace" | null
    >(null);
  const saved = q.data?.quotes.find((x) => x.id === params.id),
    editable = fresh || saved?.status === "draft";
  const hydratedId = useRef<string | null>(null);
  useEffect(() => {
    if (saved && hydratedId.current !== saved.id) {
      hydratedId.current = saved.id;
      setTitle(saved.title);
      setClientId(saved.client_id || "");
      setOrigin(saved.source);
      setNotes(saved.notes || "");
      setValidity(saved.validity_date || "");
      setDuration(saved.estimated_duration || "");
      setDiscount(String(saved.discount));
      setLines(
        saved.items?.length
          ? saved.items.map((l) => ({
              type: l.type,
              label: l.label,
              quantity: String(l.quantity),
              price: String(l.unit_price),
            }))
          : [blank()],
      );
    }
  }, [saved]);
  const number = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : NaN);
  const gate = validateQuote({ origin, title, clientId, requestId, clients: q.data?.clients || [], offers: q.data?.offers || [],
    items: lines.map(line => ({ type: line.type, label: line.label, quantity: number(line.quantity), unit_price: number(line.price) })), discount: number(discount || '0') });
  const calculated = gate.calculated;
  const unsaved = !!saved && (title !== saved.title || clientId !== (saved.client_id || '') || notes !== (saved.notes || '') || validity !== (saved.validity_date || '') || duration !== (saved.estimated_duration || '') || Number(discount || 0) !== Number(saved.discount) || JSON.stringify(calculated?.items.map(({type,label,quantity,unit_price}) => [type,label,Number(quantity),Number(unit_price)])) !== JSON.stringify(saved.items?.map(({type,label,quantity,unit_price}) => [type,label,Number(quantity),Number(unit_price)])));
  const visibleSection = gate.canEnterLines ? gate.canEnterConditions ? section : Math.min(section, 1) : 0;
  const showPreview = preview && (gate.canPreview || (!fresh && saved?.source === 'personal' && !editable));
  function goToSection(next: number) {
    if ((next >= 1 && !gate.canEnterLines) || (next >= 2 && !gate.canEnterConditions)) { a.setMessage(gate.message); return; }
    setSection(next); setPreview(false); a.setMessage('');
  }
  function openPreview() { if (!gate.canPreview) { a.setMessage(gate.message); return; } setPreview(true); }
  function patch(index: number, next: Partial<Line>) {
    setLines((old) => old.map((l, i) => (i === index ? { ...l, ...next } : l)));
  }
  async function save() {
    if (!gate.canSave) {
      a.setMessage(gate.message);
      return;
    }
    if (origin === "fixeo") {
      setPreview(true);
      setConfirmation("marketplace");
      return;
    }
    if (validity && !/^\d{4}-\d{2}-\d{2}$/.test(validity)) {
      a.setMessage("Indiquez la validité au format AAAA-MM-JJ.");
      return;
    }
    await a.run(async () => {
      const result = await saveBusinessQuote(
        {
          id: fresh ? newId : params.id,
          title,
          client_id: clientId || null,
          items: calculated!.items,
          discount: calculated!.discount,
          notes,
          validity_date: validity || null,
          estimated_duration: duration,
        },
        !fresh,
      );
      router.replace({
        pathname: "/artisan-workspace/quote/[id]" as any,
        params: { id: result.id, ...(params.clientId ? { clientId: params.clientId } : {}) },
      });
      setPreview(true);
      await q.reload();
      return result;
    }, "Brouillon enregistré.");
  }
  return (
    <ArtisanPage
      rafi={a.rafi}
      title={showPreview ? "Votre proposition." : "Chaque détail compte."}
      eyebrow="DEVIS STUDIO"
      activeKey="quotes"
      loading={q.loading}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {q.data && (fresh || saved) ? (
        <>
          {showPreview ? (
            <>
              <ArtisanSection
                label={
                  origin === "fixeo"
                    ? "PROPOSITION FIXEO"
                    : saved?.quote_number || "APERÇU · NON ENREGISTRÉ"
                }
              >
                <FixeoText variant="title">
                  {title || "Titre à compléter"}
                </FixeoText>
                <FixeoText tone="secondary">
                  {origin === "personal"
                    ? q.data.clients.find((c) => c.id === clientId)
                        ?.full_name || "Client personnel non renseigné"
                    : gate.sourceValid ? "Lié à une opportunité FIXEO" : "Source FIXEO à confirmer"}
                </FixeoText>
                {saved && (
                  <FixeoText>
                    {businessStatus[saved.status] || saved.status}
                  </FixeoText>
                )}
                {calculated ? (
                  calculated.items.map((l, i) => (
                    <View key={i} style={art.row}>
                      <FixeoText variant="bodyLarge">{l.label}</FixeoText>
                      <FixeoText tone="secondary">
                        {l.quantity} × {money(l.unit_price)} ·{" "}
                        {l.type === "labor"
                          ? "Main-d’œuvre"
                          : l.type === "supply"
                            ? "Fourniture"
                            : "Prestation"}
                      </FixeoText>
                      <FixeoText>{money(l.total)}</FixeoText>
                    </View>
                  ))
                ) : (
                  <FixeoText>Les lignes restent à compléter.</FixeoText>
                )}
                {calculated && (
                  <>
                    <FixeoText>
                      Sous-total · {money(calculated.subtotal)}
                    </FixeoText>
                    {calculated.discount > 0 && (
                      <FixeoText>
                        Remise · {money(calculated.discount)}
                      </FixeoText>
                    )}
                    <QuoteBreakdown total={calculated.total} source={origin} />
                  </>
                )}
                {validity && origin === "personal" && (
                  <FixeoText tone="secondary">
                    Valable jusqu’au {formatWorkspaceDate(validity)}
                  </FixeoText>
                )}
                {duration && (
                  <FixeoText tone="secondary">
                    Durée prévue : {duration}
                  </FixeoText>
                )}
                {notes && <FixeoText>{notes}</FixeoText>}
              </ArtisanSection>
              {editable && <View style={art.actions}>
                <FixeoAction label={origin === 'fixeo' ? 'Transmettre à FIXEO' : fresh ? 'Enregistrer le brouillon' : 'Enregistrer les modifications'} disabled={!gate.canSave} busy={a.busy} onPress={() => void save()} />
                <FixeoAction label="Modifier les détails" variant="secondary" onPress={() => setPreview(false)} />
              </View>}
              {!fresh && saved?.source === "personal" && (
                <View style={art.actions}>
                  {saved.status === "draft" && (
                    <>
                      {unsaved && <FixeoText tone="secondary">Enregistrez vos modifications avant de déclarer la transmission.</FixeoText>}
                      <FixeoAction
                        label="Déclarer le devis transmis"
                        disabled={unsaved || a.busy}
                        variant="secondary"
                        onPress={() => setConfirmation("sent")}
                      />
                    </>
                  )}
                  {saved.status === "sent" && (
                    <>
                      <FixeoAction
                        label="Enregistrer un accord reçu hors FIXEO"
                        onPress={() => setConfirmation("accepted")}
                      />
                      <FixeoAction
                        label="Enregistrer un refus reçu hors FIXEO"
                        variant="secondary"
                        onPress={() => setConfirmation("rejected")}
                      />
                    </>
                  )}
                </View>
              )}
            </>
          ) : (
            <>
              <FixeoText variant="caption" tone="secondary">Étape {visibleSection + 1} sur 3 · {['Client et intervention', 'Prestations et fournitures', 'Conditions et résumé'][visibleSection]}</FixeoText>
              <ArtisanChoices label="Étapes du devis" value={String(visibleSection)} onChange={value => goToSection(Number(value))} options={[{value:'0',label:'Client'},{value:'1',label:'Lignes',disabled:!gate.canEnterLines},{value:'2',label:'Conditions',disabled:!gate.canEnterConditions}]} />
              {visibleSection === 0 && <>
              {fresh && !params.requestId && !params.clientId && (
                <ArtisanChoices
                  label="Origine du devis"
                  value={origin}
                  onChange={value => { setOrigin(value); setRequestId(''); setSection(0); setPreview(false); }}
                  options={[
                    { value: "personal", label: "Client personnel" },
                    { value: "fixeo", label: "Opportunité FIXEO" },
                  ]}
                />
              )}
              {origin === "personal" ? (
                <ArtisanChoices
                  label="Client du devis"
                  value={clientId}
                  onChange={setClientId}
                  options={[
                    { value: "", label: "À renseigner" },
                    ...q.data.clients.map((c) => ({
                      value: c.id,
                      label: c.full_name,
                    })),
                  ]}
                />
              ) : (
                <ArtisanChoices
                  label="Opportunité concernée"
                  value={requestId}
                  onChange={setRequestId}
                  options={q.data.offers.map((o) => ({
                    value: o.request_id,
                    label: `${o.service_category || "Demande"} · ${o.city || ""}`,
                  }))}
                />
              )}
              {origin === "fixeo" && q.data.offers.length === 0 && (
                <FixeoText>
                  Aucune opportunité active disponible pour préparer un devis
                  FIXEO.
                </FixeoText>
              )}
              <ArtisanField
                label="Titre du devis"
                value={title}
                onChangeText={setTitle}
              />
              {gate.identityError && <FixeoText accessibilityLiveRegion="polite" tone="secondary">{gate.identityError}</FixeoText>}
              <FixeoAction label="Continuer vers les lignes" disabled={!gate.canEnterLines} onPress={() => goToSection(1)} />
              </>}
              {visibleSection === 1 && <>
              <ArtisanCue
                title="RAFI · Structurer votre devis"
                text="Décrivez chaque prestation, puis les fournitures et la main-d’œuvre. Renseignez vos propres prix et ce que le devis comprend."
              />
              {lines.map((l, i) => (
                <ArtisanSection label={`LIGNE ${i + 1}`} key={i}>
                  <ArtisanChoices
                    label={`Type de ligne ${i + 1}`}
                    value={l.type}
                    onChange={(v) => patch(i, { type: v as Line["type"] })}
                    options={[
                      { value: "service", label: "Prestation" },
                      { value: "supply", label: "Fourniture" },
                      { value: "labor", label: "Main-d’œuvre" },
                    ]}
                  />
                  <ArtisanField
                    label={`Désignation ${i + 1}`}
                    value={l.label}
                    onChangeText={(v) => patch(i, { label: v })}
                  />
                  <ArtisanField
                    label={`Quantité ${i + 1}`}
                    value={l.quantity}
                    keyboardType="decimal-pad"
                    onChangeText={(v) => patch(i, { quantity: v })}
                  />
                  <ArtisanField
                    label={`Prix unitaire ${i + 1} en MAD`}
                    value={l.price}
                    keyboardType="decimal-pad"
                    onChangeText={(v) => patch(i, { price: v })}
                  />
                  {lines.length > 1 && (
                    <FixeoAction
                      label={`Retirer la ligne ${i + 1}`}
                      variant="ghost"
                      onPress={() =>
                        setLines((v) => v.filter((_, n) => n !== i))
                      }
                    />
                  )}
                </ArtisanSection>
              ))}
              <FixeoAction
                label="Ajouter une ligne"
                variant="secondary"
                disabled={lines.length >= 50}
                onPress={() => setLines((v) => [...v, blank()])}
              />
              {gate.lineError && <FixeoText accessibilityLiveRegion="polite" tone="secondary">{gate.lineError}</FixeoText>}
              <FixeoAction label="Continuer vers les conditions" disabled={!gate.canEnterConditions} onPress={() => goToSection(2)} />
              </>}
              {visibleSection === 2 && <>
              {origin === "personal" && (
                <>
                  <ArtisanField
                    label="Remise en MAD"
                    value={discount}
                    keyboardType="decimal-pad"
                    onChangeText={setDiscount}
                  />
                  <DateField label="Valable jusqu’au" value={validity} onChange={setValidity} />
                </>
              )}
              <ArtisanField
                label="Durée prévue"
                value={duration}
                onChangeText={setDuration}
              />
              <ArtisanField
                label="Notes et conditions"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <ArtisanSection label="TOTAL">
                <FixeoText variant="title">
                  {calculated ? money(calculated.total) : "À compléter"}
                </FixeoText>
                <FixeoAction
                  label="Voir l’aperçu"
                  variant="secondary"
                  disabled={!gate.canPreview}
                  onPress={openPreview}
                />
                <FixeoAction
                  label={
                    origin === "fixeo"
                      ? "Transmettre à FIXEO"
                      : "Enregistrer le brouillon"
                  }
                  busy={a.busy}
                  disabled={!gate.canSave}
                  onPress={() => void save()}
                />
              </ArtisanSection>
              </>}
            </>
          )}
          {confirmation && (
            <Modal visible transparent animationType="slide" onRequestClose={() => { if (!a.busy) setConfirmation(null); }}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)', padding: 20, paddingBottom: 40 }}>
            <ScrollView style={{ maxHeight: '85%' }} keyboardShouldPersistTaps="handled"><ArtisanSection label="CONFIRMER CETTE ACTION">
              <ArtisanMessage message={a.message} />
              <FixeoText>
                {confirmation === "marketplace"
                  ? "Votre proposition sera transmise à FIXEO pour vérification avant présentation au client."
                  : confirmation === "sent"
                    ? "Confirmez que vous avez déjà envoyé ce devis au client. Cette action enregistre votre déclaration."
                    : confirmation === "accepted"
                      ? "Vous déclarez un accord reçu hors FIXEO. Une intervention personnelle sera créée, sans commission marketplace."
                      : "Vous déclarez un refus reçu hors FIXEO. Le devis sera clôturé."}
              </FixeoText>
              <FixeoAction
                label="Confirmer"
                disabled={confirmation === "marketplace" && !gate.canSave}
                busy={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    if (confirmation === "marketplace") {
                      if (!gate.canSave || !calculated) throw new Error("QUOTE_INVALID");
                      const result = await submitMarketplaceQuote({
                        requestId,
                        title,
                        items: calculated.items,
                        message: notes,
                        duration,
                      });
                      setConfirmation(null);
                      router.replace("/artisan-workspace/quotes");
                      return result;
                    }
                    const result = await recordQuoteDecision(
                      params.id,
                      confirmation,
                    );
                    setConfirmation(null);
                    await q.reload();
                    return result;
                  }, "Action enregistrée.")
                }
              />
              <FixeoAction
                label="Annuler"
                variant="ghost"
                disabled={a.busy}
                onPress={() => setConfirmation(null)}
              />
            </ArtisanSection></ScrollView></View></Modal>
          )}
        </>
      ) : (
        !q.loading &&
        !q.error && <FixeoText>Devis introuvable ou accès refusé.</FixeoText>
      )}
    </ArtisanPage>
  );
}
