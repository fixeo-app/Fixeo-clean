import { useEffect, useState } from "react";
import { View } from "react-native";
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
  calculateQuote,
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
import type { ContextDockSpec } from "@/ui/shellContract";
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
  useEffect(() => {
    if (saved) {
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
  let calculated: ReturnType<typeof calculateQuote> | null = null;
  try {
    calculated = calculateQuote(
      lines.map((l) => ({
        type: l.type,
        label: l.label,
        quantity: number(l.quantity),
        unit_price: number(l.price),
      })),
      origin === "personal" ? number(discount || "0") : 0,
    );
  } catch {}
  function patch(index: number, next: Partial<Line>) {
    setLines((old) => old.map((l, i) => (i === index ? { ...l, ...next } : l)));
  }
  async function save() {
    if (!calculated || !title.trim() || (origin === "fixeo" && !requestId)) {
      a.setMessage(
        "Complétez le titre et chaque ligne avec vos quantités et prix.",
      );
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
        params: { id: result.id },
      });
      setPreview(true);
      await q.reload();
      return result;
    }, "Brouillon enregistré.");
  }
  const dock: ContextDockSpec = {
    universe: "artisan",
    hidden: !editable || !!confirmation,
    items: [
      {
        key: "line",
        label: "Ligne",
        icon: "add-outline",
        accessibilityLabel: "Ajouter une ligne au devis",
        disabled: lines.length >= 50,
        action: () => {
          setPreview(false);
          setLines((v) => [...v, blank()]);
        },
      },
      {
        key: "preview",
        label: preview ? "Modifier" : "Aperçu",
        icon: "eye-outline",
        accessibilityLabel: preview
          ? "Modifier les lignes"
          : "Afficher l’aperçu du devis",
        action: () => setPreview((v) => !v),
      },
      {
        key: "save",
        label: origin === "fixeo" ? "Transmettre" : "Enregistrer",
        icon: "checkmark-outline",
        accessibilityLabel:
          origin === "fixeo"
            ? "Confirmer la transmission à FIXEO"
            : "Enregistrer le brouillon",
        disabled: a.busy,
        action: () => void save(),
      },
    ],
  };
  return (
    <ArtisanPage
      rafi={a.rafi}
      title={preview ? "Votre proposition." : "Chaque détail compte."}
      eyebrow="DEVIS STUDIO"
      activeKey="quotes"
      loading={q.loading}
      dock={dock}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {q.data && (fresh || saved) ? (
        <>
          {preview ? (
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
                    : "Lié à une opportunité FIXEO"}
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
                    <FixeoText variant="title">
                      {money(calculated.total)}
                    </FixeoText>
                  </>
                )}
                {validity && origin === "personal" && (
                  <FixeoText tone="secondary">
                    Valable jusqu’au {validity}
                  </FixeoText>
                )}
                {duration && (
                  <FixeoText tone="secondary">
                    Durée prévue : {duration}
                  </FixeoText>
                )}
                {notes && <FixeoText>{notes}</FixeoText>}
              </ArtisanSection>
              {!fresh && saved?.source === "personal" && (
                <View style={art.actions}>
                  {saved.status === "draft" && (
                    <>
                      <FixeoAction
                        label="Modifier le brouillon"
                        variant="secondary"
                        onPress={() => setPreview(false)}
                      />
                      <FixeoAction
                        label="Enregistrer l’envoi au client"
                        onPress={() => setConfirmation("sent")}
                      />
                    </>
                  )}
                  {saved.status === "sent" && (
                    <>
                      <FixeoAction
                        label="Enregistrer l’accord client"
                        onPress={() => setConfirmation("accepted")}
                      />
                      <FixeoAction
                        label="Enregistrer le refus client"
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
              {fresh && (
                <ArtisanChoices
                  label="Origine du devis"
                  value={origin}
                  onChange={setOrigin}
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
              {origin === "personal" && (
                <>
                  <ArtisanField
                    label="Remise en MAD"
                    value={discount}
                    keyboardType="decimal-pad"
                    onChangeText={setDiscount}
                  />
                  <ArtisanField
                    label="Validité — AAAA-MM-JJ"
                    value={validity}
                    onChangeText={setValidity}
                  />
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
                  onPress={() => setPreview(true)}
                />
                <FixeoAction
                  label={
                    origin === "fixeo"
                      ? "Transmettre à FIXEO"
                      : "Enregistrer le brouillon"
                  }
                  busy={a.busy}
                  onPress={() => void save()}
                />
              </ArtisanSection>
            </>
          )}
          {confirmation && (
            <ArtisanSection label="CONFIRMER CETTE ACTION">
              <FixeoText>
                {confirmation === "marketplace"
                  ? "Votre proposition sera transmise à FIXEO pour vérification avant présentation au client."
                  : confirmation === "sent"
                    ? "Confirmez que vous avez déjà envoyé ce devis au client. Cette action enregistre votre déclaration."
                    : confirmation === "accepted"
                      ? "Confirmez que le client a donné son accord. Une intervention personnelle sera créée."
                      : "Confirmez que le client a refusé ce devis."}
              </FixeoText>
              <FixeoAction
                label="Confirmer"
                busy={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    if (confirmation === "marketplace") {
                      if (!calculated) throw new Error("QUOTE_INVALID");
                      const result = await submitMarketplaceQuote({
                        requestId,
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
            </ArtisanSection>
          )}
        </>
      ) : (
        !q.loading &&
        !q.error && <FixeoText>Devis introuvable ou accès refusé.</FixeoText>
      )}
    </ArtisanPage>
  );
}
