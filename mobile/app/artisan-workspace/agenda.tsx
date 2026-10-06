import { AgendaDateTimeField } from '@/components/AgendaDateTimeField';
import { useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import {
  loadBusinessClients,
  loadBusinessJobs,
  loadArtisanMissions,
  saveBusinessJob,
} from "@/lib/artisanOS";
import {
  agendaConflicts,
  businessStatus,
  localDay,
  when,
} from "@/lib/artisanExperience";
import {
  parseAgendaDateTime, pickerDateParts,
} from "@/lib/agendaDate";
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
  const [jobs, clients, missions] = await Promise.all([
    loadBusinessJobs(),
    loadBusinessClients(),
    loadArtisanMissions(),
  ]);
  return { jobs, clients, missions };
};
export default function Agenda() {
  const params = useLocalSearchParams<{ clientId?: string; new?: string; day?: string }>(),
    q = useArtisanQuery(load),
    a = useArtisanAction();
  const [open, setOpen] = useState(params.new === "1"),
    [period, setPeriod] = useState("today"),
    [id, setId] = useState(() => Crypto.randomUUID()),
    [title, setTitle] = useState(""),
    [clientId, setClientId] = useState(params.clientId || ""),
    [date, setDate] = useState(() => { if (params.day !== "tomorrow") return ""; const day=new Date(); day.setDate(day.getDate()+1); return pickerDateParts(day).date; }),
    [time, setTime] = useState(""),
    [notes, setNotes] = useState("");
  const day = localDay(),
    weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const jobs = q.data?.jobs
    .filter(
      (j) =>
        period === "all" ||
        (!!j.scheduled_at &&
          (period === "today"
            ? localDay(j.scheduled_at) === day
            : localDay(j.scheduled_at) >= day &&
              localDay(j.scheduled_at) < localDay(weekEnd))),
    )
    .sort(
      (x, y) =>
        (Date.parse(x.scheduled_at || "") || Infinity) -
        (Date.parse(y.scheduled_at || "") || Infinity),
    );
  const conflicts = agendaConflicts(q.data?.jobs || []);
  return (
    <ArtisanPage
      rafi={a.rafi}
      title="Une journée bien menée."
      eyebrow="VOTRE AGENDA"
      detail="Vos interventions personnelles et missions FIXEO."
      activeKey="agenda"
      transactional={open}
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      <FixeoAction
        label={open ? "Fermer la planification" : "Planifier une intervention"}
        onPress={() => setOpen((v) => !v)}
      />
      {open && q.data && (
        <ArtisanSection label="INTERVENTION PERSONNELLE">
          <ArtisanField
            label="Titre de l’intervention"
            value={title}
            onChangeText={setTitle}
          />
          <ArtisanChoices
            label="Client concerné"
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
          <AgendaDateTimeField date={date} time={time} onDate={setDate} onTime={setTime} />
          <FixeoText variant="supporting" tone="secondary">
            Saisie dans le fuseau horaire de votre appareil.
          </FixeoText>
          <ArtisanField
            label="Notes de l’intervention"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <FixeoAction
            label="Enregistrer l’intervention"
            busy={a.busy}
            onPress={() => {
              const at = parseAgendaDateTime(date, time);
              if (!at || !title.trim()) {
                a.setMessage(
                  "Renseignez le titre, une date et une heure valides.",
                );
                return;
              }
              void a.run(async () => {
                const result = await saveBusinessJob({
                  id,
                  title,
                  client_id: clientId || null,
                  scheduled_at: at,
                  notes,
                });
                setOpen(false);
                setTitle("");
                setNotes("");
                setId(Crypto.randomUUID());
                await q.reload();
                return result;
              }, "Intervention planifiée.");
            }}
          />
        </ArtisanSection>
      )}
      <ArtisanChoices
        label="Période"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "today", label: "Aujourd’hui" },
          { value: "week", label: "7 jours" },
          { value: "all", label: "Tout" },
        ]}
      />
      <ArtisanCue
        title="RAFI · Organiser la journée"
        text={
          conflicts.size
            ? "Plusieurs interventions commencent à la même heure. Vérifiez leurs créneaux avant de vous engager."
            : jobs?.length
              ? `${jobs.length} intervention(s) personnelle(s) sur cette période.`
              : "Aucune intervention personnelle à cet horizon. Gardez votre disponibilité à jour."
        }
      />
      {jobs?.map((j) => (
        <View style={art.row} key={j.id}>
          <FixeoText variant="eyebrow" tone="secondary">
            {when(j.scheduled_at)}
          </FixeoText>
          <FixeoText variant="heading">{j.title}</FixeoText>
          <FixeoText tone="secondary">
            {q.data?.clients.find((c) => c.id === j.client_id)?.full_name ||
              "Client non renseigné"}{" "}
            · {businessStatus[j.status] || j.status}
          </FixeoText>
          {j.scheduled_at &&
            conflicts.has(new Date(j.scheduled_at).toISOString()) && (
              <FixeoText>Créneau à vérifier : début simultané.</FixeoText>
            )}
          {j.notes && <FixeoText>{j.notes}</FixeoText>}
        </View>
      ))}
      {jobs?.length === 0 && (
        <ArtisanEmpty
          title="Votre agenda est libre."
          detail="Planifiez une intervention ou préparez vos prochains rendez-vous."
        />
      )}
      {q.data && (
        <ArtisanSection label="MISSIONS FIXEO EN COURS">
          {q.data.missions
            .filter(
              (m) => !["validated", "cancelled"].includes(m.request_status),
            )
            .map((m) => (
              <View key={m.mission_id} style={art.row}>
                <FixeoText variant="heading">
                  {m.service_category || "Mission FIXEO"}
                </FixeoText>
                <FixeoText tone="secondary">
                  {m.city} ·{" "}
                  {businessStatus[m.request_status] || m.request_status}
                </FixeoText>
                <FixeoText variant="supporting">
                  Créneau non communiqué dans le suivi actuel.
                </FixeoText>
                <FixeoAction
                  label="Ouvrir la mission"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/mission/[id]",
                      params: { id: m.mission_id },
                    })
                  }
                />
              </View>
            ))}
          {!q.data.missions.some(
            (m) => !["validated", "cancelled"].includes(m.request_status),
          ) && (
            <FixeoText tone="secondary">Aucune mission FIXEO active.</FixeoText>
          )}
        </ArtisanSection>
      )}
    </ArtisanPage>
  );
}
