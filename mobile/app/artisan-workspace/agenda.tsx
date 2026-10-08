import { AgendaDateTimeField } from '@/components/AgendaDateTimeField';
import { useRef, useState } from "react";
import { View, TextInput } from "react-native";
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
  parseAgendaDateTime, moroccoDateParts,
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
    [date, setDate] = useState(() => { if (params.day !== "tomorrow") return ""; const day = new Date(`${localDay()}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1); return moroccoDateParts(day).date; }),
    [time, setTime] = useState(""),
    [notes, setNotes] = useState("");
  const titleRef = useRef<TextInput>(null), dateRef = useRef<TextInput>(null), timeRef = useRef<TextInput>(null);
  const [attempted, setAttempted] = useState(false);
  const errors = {
    title: !title.trim() ? 'Renseignez le titre de l’intervention.' : '',
    date: !date.trim() ? 'Choisissez une date.' : !parseAgendaDateTime(date, '12:00') ? 'Vérifiez la date de l’intervention.' : '',
    time: !time.trim() ? 'Choisissez une heure.' : !parseAgendaDateTime('01/01/2026', time) ? 'Vérifiez l’heure de l’intervention.' : '',
  };
  const day = localDay(),
    weekEnd = new Date(`${day}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
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
      list={open ? undefined : { data: jobs || [], keyExtractor: j => j.id, renderItem: ({ item: j }) => (
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
      ) }}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      <FixeoAction
        label={open ? "Annuler la planification" : "Planifier une intervention"}
        variant={open ? "ghost" : "primary"}
        onPress={() => setOpen((v) => !v)}
      />
      {open && q.data && (
        <ArtisanSection label="INTERVENTION PERSONNELLE">
          <ArtisanField
            inputRef={titleRef}
            error={attempted ? errors.title : undefined}
            label="Titre de l’intervention"
            value={title}
            onChangeText={value => { setTitle(value); a.setMessage(''); }}
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
          <AgendaDateTimeField errors={attempted ? errors : undefined} dateRef={dateRef} timeRef={timeRef} date={date} time={time} onDate={value => { setDate(value); a.setMessage(''); }} onTime={value => { setTime(value); a.setMessage(''); }} />
          <FixeoText variant="supporting" tone="secondary">
            Heure du Maroc · format 24 heures.
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
              setAttempted(true);
              const at = parseAgendaDateTime(date, time);
              if (!at || !title.trim()) {
                a.setMessage(errors.title || errors.date || errors.time || 'Cette heure est ambiguë ou indisponible au Maroc. Choisissez un autre créneau.');
                (errors.title ? titleRef : errors.date ? dateRef : timeRef).current?.focus();
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
                setAttempted(false);
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
      {!open && <>
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

      {jobs?.length === 0 && (
        <ArtisanEmpty
          title={period === 'today' ? 'Agenda libre aujourd’hui.' : period === 'week' ? 'Aucune intervention sur ces 7 jours.' : 'Aucune intervention personnelle.'}
          detail={period === 'today' ? 'Consultez les 7 prochains jours pour vos autres rendez-vous.' : 'Planifiez une intervention ou préparez vos prochains rendez-vous.'}
        />
      )}
      {q.data && (
        <ArtisanSection label="MISSIONS FIXEO EN COURS">
          <FixeoAction label="Toutes les missions" variant="ghost" onPress={() => router.push('/artisan-workspace/missions')} />
          {q.data.missions
            .filter(
              (m) => !["validated", "cancelled"].includes(m.request_status),
            )
            .slice(0, 3)
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
      </>}
    </ArtisanPage>
  );
}
