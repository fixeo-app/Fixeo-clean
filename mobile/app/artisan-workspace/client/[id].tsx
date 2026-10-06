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
  const [newId] = useState(() => Crypto.randomUUID());
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
    if (c) {
      setName(c.full_name);
      setPhone(c.phone || "");
      setCity(c.city || "");
      setAddress(c.address || "");
      setNotes(c.notes || "");
    }
  }, [q.data?.client]);
  const client = q.data?.client;
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
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {q.data && (fresh || client) ? (
        edit ? (
          <>
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
            <FixeoAction
              label="Enregistrer le client"
              busy={a.busy}
              disabled={!name.trim()}
              onPress={() =>
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
                  );
                  if (fresh)
                    router.replace({
                      pathname: "/artisan-workspace/client/[id]" as any,
                      params: { id: c.id },
                    });
                  else {
                    setEdit(false);
                    await q.reload();
                  }
                  return c;
                }, "Fiche enregistrée.")
              }
            />
            {!fresh && (
              <FixeoAction
                label="Annuler la modification"
                variant="ghost"
                onPress={() => setEdit(false)}
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
                onPress={() => setEdit(true)}
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
              {q.data.quotes.map((x) => (
                <View style={art.row} key={x.id}>
                  <FixeoText>
                    {x.quote_number} · {x.title}
                  </FixeoText>
                  <FixeoText tone="secondary">
                    {businessStatus[x.status] || x.status} · {money(x.total)}
                  </FixeoText>
                  <FixeoAction
                    label="Ouvrir le devis"
                    variant="ghost"
                    onPress={() =>
                      router.push({
                        pathname: "/artisan-workspace/quote/[id]" as any,
                        params: { id: x.id },
                      })
                    }
                  />
                </View>
              ))}
              {q.data.jobs.map((x) => (
                <View style={art.row} key={x.id}>
                  <FixeoText>{x.title}</FixeoText>
                  <FixeoText tone="secondary">
                    {when(x.scheduled_at)} ·{" "}
                    {businessStatus[x.status] || x.status}
                  </FixeoText>
                </View>
              ))}
              {q.data.ledger.map((x) => (
                <View style={art.row} key={x.id}>
                  <FixeoText>
                    {x.entry_type === "income" ? "Encaissement" : "Dépense"} ·{" "}
                    {money(x.amount)}
                  </FixeoText>
                  <FixeoText tone="secondary">
                    {x.occurred_on} · {x.note || "Mouvement renseigné"}
                  </FixeoText>
                </View>
              ))}
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
