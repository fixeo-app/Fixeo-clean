import { formatWorkspaceDate } from '@/lib/workspacePresentation';
import { validISODate } from '@/lib/dateValidation';
import { DateField } from '@/components/DateField';
import { useLocalSearchParams } from 'expo-router';
import { ledgerDetailLabel, ledgerTypeLabel, ledgerJobLabel } from '@/lib/ledgerPresentation';
import { useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import {
  loadBusinessClients,
  loadBusinessJobs,
  loadLedger,
  saveLedgerEntry,
} from "@/lib/artisanOS";
import { ledgerTotals, localDay, money } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanEmpty,
  ArtisanMessage,
  ArtisanField,
  ArtisanChoices,
  useArtisanQuery,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
const load = async () => {
  const [ledger, clients, jobs] = await Promise.all([
    loadLedger(),
    loadBusinessClients(),
    loadBusinessJobs(),
  ]);
  return { ledger, clients, jobs };
};
export default function Finance() {
  const params=useLocalSearchParams<{new?:string;kind?:string;amount?:string}>();
  const q = useArtisanQuery(load),
    a = useArtisanAction();
  const [open, setOpen] = useState(params.new === "1"),
    [period, setPeriod] = useState("month"),
    [kind, setKind] = useState(params.kind === "expense" ? "expense" : "income"),
    [amount, setAmount] = useState(/^\d{1,6}(?:[.,]\d{1,2})?$/.test(params.amount || "") ? params.amount! : ""),
    [note, setNote] = useState(""),
    [date, setDate] = useState(localDay()),
    [clientId, setClientId] = useState(""),
    [jobId, setJobId] = useState(""),
    [id, setId] = useState(() => Crypto.randomUUID());
  const [attempted, setAttempted] = useState(false);
  const amountError = !/^\d{1,6}(?:[.,]\d{1,2})?$/.test(amount.trim()) || Number(amount.replace(',', '.')) <= 0 || Number(amount.replace(',', '.')) > 500000 ? 'Montant positif, au plus 500 000 MAD et deux décimales.' : '';
  const rows = q.data?.ledger.filter(
    (r) =>
      period === "all" ||
      (period === "today"
        ? r.occurred_on === localDay()
        : r.occurred_on.startsWith(localDay().slice(0, 7))),
  );
  const totals = rows ? ledgerTotals(rows) : null;
  return (
    <ArtisanPage
      rafi={a.rafi}
      title="Votre activité, en clair."
      eyebrow="FINANCES"
      detail="Les encaissements et dépenses que vous avez enregistrés."
      activeKey="finance"
      transactional={open}
      loading={q.loading}
      onRefresh={() => void q.reload()}
      list={open ? undefined : { data: rows || [], keyExtractor: r => r.id, renderItem: ({ item: r }) => (
        <View style={art.row} key={r.id}>
          <FixeoText variant="eyebrow" tone="secondary">
            {formatWorkspaceDate(r.occurred_on)} · {ledgerTypeLabel(r)}
          </FixeoText>
          <FixeoText variant="heading">
            {r.entry_type === "income" ? "+" : "−"} {money(r.amount)}
          </FixeoText>
          {ledgerDetailLabel(r) !== ledgerTypeLabel(r) && <FixeoText>{ledgerDetailLabel(r)}</FixeoText>}
          {r.client_id && (
            <FixeoText tone="secondary">
              {q.data?.clients.find((c) => c.id === r.client_id)?.full_name ||
                "Client lié"}
            </FixeoText>
          )}
          {!!r.job_id && <FixeoText variant="supporting" tone="secondary">Intervention · {ledgerJobLabel(r, q.data?.jobs || [])}</FixeoText>}
        </View>
      ) }}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {!open && <>
      <ArtisanChoices
        label="Période financière"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "today", label: "Aujourd’hui" },
          { value: "month", label: "Ce mois" },
          { value: "all", label: "Historique" },
        ]}
      />
      {totals && (
        <ArtisanSection label="MOUVEMENTS ENREGISTRÉS" dark>
          <FixeoText variant="eyebrow" tone="inverseSecondary">
            ENCAISSEMENTS
          </FixeoText>
          <FixeoText variant="title" tone="inverse">
            {money(totals.income)}
          </FixeoText>
          <FixeoText tone="inverseSecondary">
            Dépenses · {money(totals.expense)}
          </FixeoText>
          <FixeoText variant="supporting" tone="inverseSecondary">
            {period === 'today' ? 'Aujourd’hui' : period === 'month' ? 'Ce mois' : 'Historique disponible'} · {rows?.length || 0} mouvements
          </FixeoText>
        </ArtisanSection>
      )}
      {(q.data?.ledger.length || 0) >= 200 && <FixeoText tone="secondary">Synthèse limitée aux 200 derniers mouvements disponibles.</FixeoText>}
      <ArtisanCue
        title="RAFI · Lire votre activité"
        text={
          rows?.length
            ? `${rows.length} mouvement(s) enregistré(s) sur cette période. Ces montants décrivent les saisies, pas un solde bancaire ni un bénéfice.`
            : "Vos prochains encaissements et dépenses apparaîtront ici après enregistrement."
        }
      />
      </>}
      <FixeoAction
        label={open ? "Fermer la saisie" : "Ajouter un mouvement"}
        variant={open ? "ghost" : "primary"}
        onPress={() => setOpen((v) => !v)}
      />
      {open && q.data && (
        <ArtisanSection label="MOUVEMENT PERSONNEL">
          <ArtisanChoices
            label="Type de mouvement"
            value={kind}
            onChange={setKind}
            options={[
              { value: "income", label: "Encaissement" },
              { value: "expense", label: "Dépense" },
            ]}
          />
          <ArtisanField
            label="Montant en MAD"
            value={amount}
            onChangeText={value => { setAmount(value); a.setMessage(''); }}
            error={attempted ? amountError : undefined}
            keyboardType="decimal-pad"
          />
          <DateField label="Date du mouvement" value={date} onChange={value => { setDate(value); a.setMessage(''); }} />
          {attempted && !validISODate(date) && <FixeoText accessibilityRole="alert">Choisissez une date réelle.</FixeoText>}
          <ArtisanChoices
            label="Client lié au mouvement"
            value={clientId}
            onChange={(v) => {
              setClientId(v);
              setJobId("");
            }}
            options={[
              { value: "", label: "Aucun" },
              ...q.data.clients.map((c) => ({
                value: c.id,
                label: c.full_name,
              })),
            ]}
          />
          <ArtisanChoices
            label="Intervention liée"
            value={jobId}
            onChange={value => { setJobId(value); if (value) setClientId(q.data?.jobs.find(job => job.id === value)?.client_id || ""); }}
            options={[
              { value: "", label: "Aucune" },
              ...q.data.jobs
                .filter(
                  (j) =>
                    j.source === "personal" &&
                    (!clientId || j.client_id === clientId),
                )
                .map((j) => ({ value: j.id, label: j.title })),
            ]}
          />
          <ArtisanField
            label="Note du mouvement"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <FixeoAction
            label="Confirmer le mouvement"
            busy={a.busy}
            onPress={() => {
              setAttempted(true);
              const n = Number(amount.replace(",", "."));
              if (
                !!amountError || !Number.isFinite(n) ||
                n <= 0 ||
                n > 500000 || !validISODate(date)
              ) {
                a.setMessage(
                  "Renseignez un montant positif et une date valide.",
                );
                return;
              }
              void a.run(async () => {
                const r = await saveLedgerEntry({
                  id,
                  entry_type: kind as "income" | "expense",
                  amount: n,
                  occurred_on: date,
                  note,
                  client_id: clientId || null,
                  job_id: jobId || null,
                });
                setAttempted(false); setOpen(false);
                setAmount("");
                setNote("");
                setId(Crypto.randomUUID());
                await q.reload();
                return r;
              }, "Mouvement enregistré.");
            }}
          />
        </ArtisanSection>
      )}

      {!open && rows?.length === 0 && (
        <ArtisanEmpty
          title="Vos mouvements commenceront ici."
          detail="Enregistrez un encaissement reçu ou une dépense réelle."
        />
      )}
    </ArtisanPage>
  );
}
