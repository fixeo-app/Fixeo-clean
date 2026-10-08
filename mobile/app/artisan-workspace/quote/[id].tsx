import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { QuoteProposal } from '@/components/QuoteProposal';
import { validISODate } from '@/lib/dateValidation';
import type { QuoteDocument } from '@/lib/quoteDocument';
import { loadQuoteDraft, saveQuoteDraft, removeQuoteDraft, type QuoteDraft } from '@/lib/quoteDrafts';
import { validateQuote } from '@/lib/quoteValidation';
import { formatWorkspaceDate } from '@/lib/workspacePresentation';
import { QuoteBreakdown } from '@/components/QuoteBreakdown';
import { DateField } from '@/components/DateField';
import { useEffect, useRef, useState } from "react";
import { Keyboard, Modal, ScrollView, View } from "react-native";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { getDispatchOffers } from "@/lib/magicLoop";
import {
  loadBusinessClients,
  loadArtisanProfile,
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
  const [clients, quotes, offers, profile] = await Promise.all([
    loadBusinessClients(),
    loadBusinessQuotes(),
    getDispatchOffers(),
    loadArtisanProfile(),
  ]);
  return { clients, quotes, offers, profile };
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
  const [pendingQuote,setPendingQuote] = useState(false);
  const [newId, setNewId] = useState(() => Crypto.randomUUID());
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
  const owner = q.data?.profile?.owner_user_id || '';
  const draftScope = fresh ? `new:${params.origin || ''}:${params.clientId || ''}:${params.requestId || ''}` : params.id;
  const identity = `${owner}:${draftScope}`;
  const [baseline, setBaseline] = useState<string | undefined>();
  const [draftReady, setDraftReady] = useState('');
  const [storageState,setStorageState] = useState<'loading'|'saving'|'saved'|'server'|'error'>('loading');
  const [readError,setReadError] = useState(false), [readRetry,setReadRetry] = useState(0);
  const [serverPreview,setServerPreview] = useState(false), [activeLine,setActiveLine] = useState(0);
  const draftClosed = useRef(false), initialized = useRef(''), writeEpoch = useRef(0);
  const savedRef = useRef(saved); savedRef.current = saved;
  function applyDraft(d: QuoteDraft) {
    setNewId(d.id); setOrigin(d.origin); setClientId(d.clientId); setRequestId(d.requestId); setTitle(d.title);
    setLines(d.lines); setDiscount(d.discount); setNotes(d.notes); setValidity(d.validity); setDuration(d.duration); setSection(d.section); setBaseline(d.baseline); setPendingQuote(!!d.pending);
  }
  function applyServer() {
    const row=savedRef.current; if (!row) return;
    setTitle(row.title); setClientId(row.client_id || ''); setOrigin(row.source); setNotes(row.notes || '');
    setValidity(row.validity_date || ''); setDuration(row.estimated_duration || ''); setDiscount(String(row.discount));
    setLines(row.items?.length ? row.items.map(l=>({type:l.type,label:l.label,quantity:String(l.quantity),price:String(l.unit_price)})) : [blank()]);
    setBaseline(row.updated_at); setServerPreview(false);
  }
  useEffect(() => {
    if (!owner || !draftScope || initialized.current === identity) return;
    let alive=true; draftClosed.current=false; setDraftReady(''); setReadError(false);
    if (savedRef.current) applyServer();
    void loadQuoteDraft(owner,draftScope).then(d=>{
      if (!alive) return;
      // A stale draft is kept intact and shown as a conflict, never silently discarded.
      if (d && editable) applyDraft(d);
      initialized.current=identity; setDraftReady(identity); setStorageState('saved');
    }).catch(()=>{if(alive){setReadError(true);setStorageState('error');}});
    return ()=>{alive=false;};
  // Hydration is scoped to owner + document. Refresh must never rehydrate the editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner,draftScope,identity,readRetry]);
  useEffect(() => {
    if (!owner || draftReady !== identity || !editable || draftClosed.current) return;
    const epoch=++writeEpoch.current; let alive=true; setStorageState('saving');
    void saveQuoteDraft(owner,draftScope,{id:newId,baseline,pending:pendingQuote,origin,clientId,requestId,title,lines,discount,notes,validity,duration,section})
      .then(()=>{if(alive && epoch===writeEpoch.current)setStorageState('saved');})
      .catch(()=>{if(alive && epoch===writeEpoch.current)setStorageState('error');});
    return ()=>{alive=false;};
  },[owner,draftScope,identity,draftReady,editable,newId,baseline,pendingQuote,origin,clientId,requestId,title,lines,discount,notes,validity,duration,section]);
  const conflict = !fresh && !!saved && draftReady === identity && saved.updated_at !== baseline;
  const number = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : NaN);
  const gate = validateQuote({ origin, title, clientId, requestId, clients: q.data?.clients || [], offers: q.data?.offers || [],
    items: lines.map(line => ({ type: line.type, label: line.label, quantity: number(line.quantity), unit_price: number(line.price) })), discount: number(discount || '0') });
  const calculated = gate.calculated;
  const document: QuoteDocument | null = origin === 'personal' && calculated ? {
    number: saved?.quote_number || 'APERÇU · NON ENREGISTRÉ', status: saved ? businessStatus[saved.status] || saved.status : 'Brouillon',
    title, updatedAt: saved?.updated_at, issuer: { name: q.data?.profile?.name, city: q.data?.profile?.city, phone: q.data?.profile?.phone_public },
    client: q.data?.clients.find(c => c.id === clientId), ...calculated, validity, duration, notes,
  } : null;
  const unsaved = !!saved && (title !== saved.title || clientId !== (saved.client_id || '') || notes !== (saved.notes || '') || validity !== (saved.validity_date || '') || duration !== (saved.estimated_duration || '') || Number(discount || 0) !== Number(saved.discount) || JSON.stringify(calculated?.items.map(({type,label,quantity,unit_price}) => [type,label,Number(quantity),Number(unit_price)])) !== JSON.stringify(saved.items?.map(({type,label,quantity,unit_price}) => [type,label,Number(quantity),Number(unit_price)])));
  useUnsavedChanges(editable && (fresh ? !!title.trim() || lines.some(line=>!!line.label.trim()) : unsaved), storageState === 'saved');
  const visibleSection = gate.canEnterLines ? gate.canEnterConditions ? section : Math.min(section, 1) : 0;
  const showPreview = preview && (gate.canPreview || (!fresh && saved?.source === 'personal' && !editable));
  function goToSection(next: number) {
    draftClosed.current = false;
    if ((next >= 1 && !gate.canEnterLines) || (next >= 2 && !gate.canEnterConditions)) { a.setMessage(gate.message); return; }
    setSection(next); setPreview(false); a.setMessage('');
  }
  function openPreview() { if (!gate.canPreview) { a.setMessage(gate.message); return; } setPreview(true); }
  function patch(index: number, next: Partial<Line>) {
    a.setMessage('');
    setLines((old) => old.map((l, i) => (i === index ? { ...l, ...next } : l)));
  }
  async function save() {
    if ((conflict && !pendingQuote) || (owner && draftReady !== identity)) { a.setMessage('Comparez la version serveur ou restaurez le brouillon avant de continuer.'); return; }
    if (!gate.canSave) {
      a.setMessage(gate.message);
      return;
    }
    if (origin === "fixeo") {
      setPreview(true);
      setConfirmation("marketplace");
      return;
    }
    if (validity && !validISODate(validity)) {
      a.setMessage("Choisissez une date de validité réelle.");
      return;
    }
    Keyboard.dismiss(); setPendingQuote(true);
    await a.run(async () => {
      if (owner) {
        try { await saveQuoteDraft(owner,draftScope,{id:newId,baseline,pending:true,origin,clientId,requestId,title,lines,discount,notes,validity,duration,section}); }
        catch { setPendingQuote(false);setStorageState('error');throw Error('DRAFT_PERSIST_FAILED'); }
      }
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
        baseline,
      ).catch(async error => { if (/QUOTE_VERSION|BUSINESS_|23514|23503/.test(String(error?.message || '')+String(error?.code || ''))) { setPendingQuote(false); await q.reload(); } throw error; });
      setPendingQuote(false); setBaseline(result.updated_at);
      draftClosed.current = true; setStorageState('server');
      if (owner) await removeQuoteDraft(owner, draftScope).catch(() => undefined);
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
      transactional={!showPreview || !!confirmation}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {editable && owner && <FixeoText variant="supporting" accessibilityLiveRegion="polite">{readError ? 'Impossible de restaurer le brouillon local. Aucune copie existante n’a été remplacée.' : storageState === 'server' ? 'Version enregistrée sur le serveur.' : storageState === 'saved' ? 'Brouillon enregistré sur cet appareil.' : storageState === 'saving' ? 'Enregistrement local…' : storageState === 'error' ? 'Copie locale non enregistrée. Gardez cet écran ouvert ou enregistrez sur le serveur.' : 'Restauration du brouillon…'}</FixeoText>}
      {readError && <FixeoAction label="Réessayer la restauration" variant="secondary" onPress={()=>setReadRetry(v=>v+1)} />}
      {conflict && !pendingQuote && <ArtisanSection label="VERSION SERVEUR MODIFIÉE">
        <FixeoText accessibilityRole="alert">Vos modifications sont conservées. Comparez les versions avant toute nouvelle sauvegarde.</FixeoText>
        <FixeoAction label="Voir la version serveur" variant="secondary" onPress={()=>setServerPreview(true)} />
        {saved?.status === 'draft' && <FixeoAction label="Réappliquer explicitement mes modifications" variant="ghost" onPress={()=>{setBaseline(saved.updated_at);a.setMessage('Modifications réappliquées à la version relue. Vérifiez puis enregistrez.');}} />}
        <FixeoAction label="Remplacer mes modifications par la version serveur" variant="ghost" onPress={applyServer} />
      </ArtisanSection>}
      {serverPreview && saved && <Modal visible animationType="slide" onRequestClose={()=>setServerPreview(false)}><ScrollView contentContainerStyle={{padding:20}}>
        <FixeoAction label="Fermer la version serveur" variant="ghost" onPress={()=>setServerPreview(false)} />
        <QuoteProposal document={{number:saved.quote_number,status:businessStatus[saved.status] || saved.status,title:saved.title,updatedAt:saved.updated_at,
          issuer:{name:q.data?.profile?.name,city:q.data?.profile?.city,phone:q.data?.profile?.phone_public},client:q.data?.clients.find(c=>c.id===saved.client_id),
          items:saved.items,subtotal:saved.subtotal,discount:saved.discount,total:saved.total,validity:saved.validity_date || '',duration:saved.estimated_duration || '',notes:saved.notes || ''}} />
      </ScrollView></Modal>}
      {pendingQuote ? <ArtisanSection label="SAUVEGARDE À VÉRIFIER"><FixeoText accessibilityRole="alert">Les informations et l’identifiant du devis sont figés jusqu’à confirmation du résultat.</FixeoText>
        <FixeoText>{title}</FixeoText><FixeoText>{calculated ? money(calculated.total) : 'Montant à vérifier'}</FixeoText>
        <FixeoAction label="Vérifier et réessayer le devis" busy={a.busy} onPress={()=>void save()} />
      </ArtisanSection> : q.data && (fresh || saved) ? (
        <>
          {showPreview ? (
            <>
              {document ? <QuoteProposal document={document} /> : <>
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
              </>}
              {editable && <View style={art.actions}>
                <FixeoAction label={origin === 'fixeo' ? 'Transmettre à FIXEO' : fresh ? 'Enregistrer le brouillon' : 'Enregistrer les modifications'} disabled={!gate.canSave || conflict || (owner !== '' && draftReady !== identity)} busy={a.busy} onPress={() => void save()} />
                <FixeoAction label="Modifier les détails" variant="secondary" onPress={() => { draftClosed.current = false; setPreview(false); }} />
              </View>}
              {document && <View style={art.actions}>
                <FixeoAction label="Exporter / partager le PDF" variant="secondary" busy={a.busy}
                  disabled={fresh || unsaved || conflict || !q.data.profile?.name}
                  onPress={() => void a.run(async () => {
                    const { shareQuotePdf } = await import('@/lib/quotePdf');
                    return shareQuotePdf(document);
                  }, 'Feuille de partage refermée. Le statut du devis reste inchangé.')} />
                {(fresh || unsaved) && <FixeoText variant="supporting" tone="secondary">Enregistrez le brouillon pour exporter sa version exacte.</FixeoText>}
                {!q.data.profile?.name && <FixeoText variant="supporting" tone="secondary">Renseignez votre identité professionnelle pour émettre ce devis.</FixeoText>}
              </View>}
              {!fresh && saved?.source === "personal" && (
                <View style={art.actions}>
                  {saved.status === "draft" && (
                    <>
                      {unsaved && <FixeoText tone="secondary">Enregistrez vos modifications avant de déclarer la transmission.</FixeoText>}
                      <FixeoAction
                        label="Déclarer le devis transmis"
                        disabled={unsaved || conflict || a.busy}
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
                  onChange={value => { setClientId(value); a.setMessage(''); }}
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
                  onChange={value => { setRequestId(value); a.setMessage(''); }}
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
                onChangeText={value => { setTitle(value); a.setMessage(''); }}
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
                  {activeLine !== i ? <><FixeoText>{l.label || 'Désignation à compléter'} · {l.quantity} × {l.price || '—'} MAD</FixeoText><FixeoAction label={`Modifier la ligne ${i+1}`} variant="ghost" onPress={()=>setActiveLine(i)} /></> : <>

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
                        { setLines((v) => v.filter((_, n) => n !== i)); setActiveLine(Math.max(0,i-1)); }
                      }
                    />
                  )}
                  </>}
                </ArtisanSection>
              ))}
              <FixeoAction
                label="Ajouter une ligne"
                variant="secondary"
                disabled={lines.length >= 50}
                onPress={() => { setActiveLine(lines.length); setLines((v) => [...v, blank()]); }}
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
                  <DateField label="Valable jusqu’au" value={validity} onChange={value => { setValidity(value); a.setMessage(''); }} />
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
                      : fresh ? "Enregistrer le brouillon" : "Enregistrer les modifications"
                  }
                  busy={a.busy}
                  disabled={!gate.canSave || conflict || (owner !== '' && draftReady !== identity)}
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
