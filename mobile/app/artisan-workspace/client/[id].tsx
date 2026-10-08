import { usePendingBusinessForm } from '@/lib/usePendingBusinessForm';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { formatWorkspaceDate } from '@/lib/workspacePresentation';
import { CityField } from '@/components/CityField';
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import {
  loadBusinessClients,
  loadBusinessJobs,
  loadBusinessQuotes,
  loadLedger,
  saveBusinessClient,
} from "@/lib/artisanOS";
import { businessStatus, money, when } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanField,
  ArtisanCue,
  ArtisanMessage,
  useArtisanQuery,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
import type { ContextDockSpec } from "@/ui/shellContract";
export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    fresh = id === "new";
  const [newId,setNewId] = useState(() => Crypto.randomUUID());
  const q = useArtisanQuery(
    useCallback(async () => {
      const [clients, jobs, quotes, ledger] = await Promise.all([
        loadBusinessClients(),
        loadBusinessJobs(),
        loadBusinessQuotes(),
        loadLedger(),
      ]);
      return {
        client: clients.find((c) => c.id === id) || null,
        jobs: jobs.filter((j) => j.client_id === id),
        quotes: quotes.filter((x) => x.client_id === id),
        ledger: ledger.filter((x) => x.client_id === id),
      };
    }, [id]),
  );
  const a = useArtisanAction();
  const [edit, setEdit] = useState(fresh),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [city, setCity] = useState(""),
    [address, setAddress] = useState(""),
    [notes, setNotes] = useState("");
  useEffect(() => {
    const c = q.data?.client;
    if (c && !edit) {
      setName(c.full_name);
      setPhone(c.phone || "");
      setCity(c.city || "");
      setAddress(c.address || "");
      setNotes(c.notes || "");
    }
  }, [q.data?.client, edit]);
  const client = q.data?.client;
  const [baseline,setBaseline]=useState<string | undefined>();
  const pending=usePendingBusinessForm(fresh?'client-new':`client:${id}`,p=>{setNewId(String(p.id));setName(String(p.full_name));setPhone(String(p.phone||''));setCity(String(p.city||''));setAddress(String(p.address||''));setNotes(String(p.notes||''));setBaseline(p.expectedUpdatedAt?String(p.expectedUpdatedAt):undefined);setEdit(true);});
  const conflict=edit && !fresh && !!client && !!baseline && client.updated_at!==baseline;
  useUnsavedChanges(edit && (name !== (client?.full_name || '') || phone !== (client?.phone || '') || city !== (client?.city || '') || address !== (client?.address || '') || notes !== (client?.notes || '')),pending.frozen);
  const restoreClient = () => {
    if (!client) return;
    setBaseline(client.updated_at);
    setName(client.full_name); setPhone(client.phone || ''); setCity(client.city || '');
    setAddress(client.address || ''); setNotes(client.notes || ''); a.setMessage('');
  };
  const call = () => {
    if (client?.phone)
      void Linking.openURL("tel:" + client.phone.replace(/[^+\d]/g, "")).catch(
        () => a.setMessage("L’appel n’a pas pu être ouvert."),
      );
  };
  const dock: ContextDockSpec = {
    universe: "artisan",
    hidden: edit,
    items: [
      {
        key: "call",
        label: "Appeler",
        icon: "call-outline",
        accessibilityLabel: "Appeler ce client",
        disabled: !client?.phone,
        action: call,
      },
      {
        key: "quote",
        label: "Devis",
        icon: "document-text-outline",
        accessibilityLabel: "Créer un devis pour ce client",
        disabled: !client,
        action: () =>
          router.push({
            pathname: "/artisan-workspace/quote/new" as any,
            params: { clientId: id },
          }),
      },
      {
        key: "job",
        label: "Planifier",
        icon: "calendar-outline",
        accessibilityLabel: "Planifier une intervention pour ce client",
        disabled: !client,
        action: () =>
          router.push({
            pathname: "/artisan-workspace/agenda",
            params: { clientId: id, new: "1" },
          }),
      },
    ],
  };
  const history = q.data ? [
    ...q.data.quotes.map(x => ({ key: 'quote:'+x.id, at:x.updated_at, title:`${x.quote_number} · ${x.title}`, detail:`${businessStatus[x.status] || x.status} · ${money(x.total)}`, quoteId:x.id })),
    ...q.data.jobs.map(x => ({ key:'job:'+x.id, at:x.scheduled_at || '', title:x.title, detail:`${when(x.scheduled_at)} · ${businessStatus[x.status] || x.status}`, quoteId:'' })),
    ...q.data.ledger.map(x => ({ key:'ledger:'+x.id, at:x.occurred_on, title:`${x.entry_type === 'income' ? 'Encaissement' : 'Dépense'} · ${money(x.amount)}`, detail:x.note || 'Mouvement renseigné', quoteId:'' })),
  ].sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)) : [];
  return (
    <ArtisanPage
      rafi={a.rafi}
      title={
        fresh ? "Une nouvelle relation." : client?.full_name || "Fiche client."
      }
      eyebrow="CLIENT PERSONNEL"
      activeKey="clients"
      loading={q.loading}
      dock={dock}
      transactional={edit}
      onRefresh={() => void q.reload()}
      list={edit ? undefined : { data:history,keyExtractor:x=>x.key,renderItem:({item:x})=><View style={art.row}>
        <FixeoText variant="supporting" tone="secondary">{formatWorkspaceDate(x.at)}</FixeoText>
        <FixeoText variant="heading">{x.title}</FixeoText><FixeoText tone="secondary">{x.detail}</FixeoText>
        {!!x.quoteId && <FixeoAction label="Ouvrir le devis" variant="ghost" onPress={()=>router.push({pathname:'/artisan-workspace/quote/[id]',params:{id:x.quoteId}})} />}
      </View> }}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      <ArtisanMessage message={pending.error} retry={()=>void pending.refresh()} />
      {pending.frozen && <FixeoText accessibilityRole="alert">Résultat à vérifier. Les informations de cette fiche sont figées.</FixeoText>}
      {conflict && <ArtisanSection label="FICHE MODIFIÉE SUR LE SERVEUR"><FixeoText>Votre saisie est conservée. Choisissez avant de sauvegarder.</FixeoText>
        <FixeoAction label="Reprendre la fiche serveur" variant="secondary" onPress={restoreClient} />
        <FixeoAction label="Réappliquer ma saisie à cette version" variant="ghost" onPress={()=>setBaseline(client?.updated_at)} />
      </ArtisanSection>}
      {q.data && (fresh || client) ? (
        edit ? (
          <>
            <View pointerEvents={pending.frozen || a.busy ? 'none' : 'auto'}>
            <ArtisanField
              label="Nom du client"
              value={name}
              onChangeText={setName}
            />
            <ArtisanField
              label="Téléphone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <CityField label="Ville" value={city} onChange={setCity} />
            <ArtisanField
              label="Adresse"
              value={address}
              onChangeText={setAddress}
            />
            <ArtisanField
              label="Notes client"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            </View>
            <FixeoAction
              label={pending.frozen ? "Vérifier et réessayer la fiche" : fresh ? "Enregistrer le client" : "Enregistrer les modifications"}
              busy={a.busy}
              disabled={!name.trim() || conflict || !pending.ready}
              onPress={() => {
                pending.lock();
                void a.run(async () => {
                  const c = await saveBusinessClient(
                    {
                      id: fresh ? newId : id,
                      full_name: name,
                      phone,
                      city,
                      address,
                      notes,
                    },
                    !fresh,
                    baseline,
                  ).catch(async error=>{if(/CLIENT_VERSION/.test(String(error?.message || '')))await q.reload();throw error;});
                  if (fresh)
                    router.replace({
                      pathname: "/artisan-workspace/client/[id]" as any,
                      params: { id: c.id },
                    });
                  else {
                    setEdit(false);
                    await q.reload();
                  }
                  await pending.settle(); return c;
                }, "Fiche enregistrée.").finally(()=>void pending.settle());
              }}
            />
            {!fresh && !pending.frozen && (
              <FixeoAction
                label="Annuler la modification"
                variant="ghost"
                onPress={() => { restoreClient(); setEdit(false); }}
              />
            )}
          </>
        ) : (
          <>
            <ArtisanSection label="COORDONNÉES">
              <FixeoText>
                {client!.phone || "Téléphone non renseigné"}
              </FixeoText>
              <FixeoText tone="secondary">
                {[client!.address, client!.city].filter(Boolean).join(" · ") ||
                  "Adresse non renseignée"}
              </FixeoText>
              <FixeoAction
                label="Modifier la fiche"
                variant="secondary"
                onPress={() => { restoreClient(); setEdit(true); }}
              />
            </ArtisanSection>
            <ArtisanCue
              title="RAFI · Votre relation"
              text={`${q.data.jobs.length} intervention(s), ${q.data.quotes.length} devis et ${q.data.ledger.length} mouvement(s) personnels renseignés pour ce client.`}
            />
            {client!.notes && (
              <ArtisanSection label="VOS NOTES">
                <FixeoText>{client!.notes}</FixeoText>
              </ArtisanSection>
            )}
            <View>
              <FixeoText variant="heading">Historique</FixeoText>
              {!q.data.jobs.length &&
                !q.data.quotes.length &&
                !q.data.ledger.length && (
                  <FixeoText tone="secondary" style={{ marginTop: 16 }}>
                    Le premier devis ouvrira votre historique.
                  </FixeoText>
                )}
            </View>
          </>
        )
      ) : (
        !q.loading &&
        !q.error && <FixeoText>Fiche introuvable ou accès refusé.</FixeoText>
      )}
    </ArtisanPage>
  );
}
