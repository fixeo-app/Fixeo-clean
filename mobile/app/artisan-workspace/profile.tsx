import { CityZonesField } from '@/components/CityField';
import { canonicalCity } from '@/lib/clientLocation';
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import {
  loadArtisanProfile,
  artisanProfileCities,
  saveArtisanProfile,
  saveArtisanBio,
} from "@/lib/artisanOS";
import { availabilityLabels } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanSection,
  ArtisanCue,
  ArtisanField,
  ArtisanMessage,
  useArtisanQuery,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
const load = async () => {
  const profile = await loadArtisanProfile();
  return { profile, cities: artisanProfileCities(profile) };
};
export default function Profile() {
  const q = useArtisanQuery(load),
    a = useArtisanAction(),
    bioAction = useArtisanAction();
  const [phone, setPhone] = useState(""),
    [services, setServices] = useState(""),
    [cities, setCities] = useState<string[]>([]),
    [bio, setBio] = useState(""),
    [savedBio, setSavedBio] = useState("");
  const p = q.data?.profile;
  useEffect(() => {
    if (p) {
      setPhone(p.phone_public || "");
      setServices(
        p.services?.length ? p.services.join(", ") : p.service_category || "",
      );
      setCities(
        (q.data!.cities.length ? q.data!.cities : p.city ? [p.city] : []).map(value => canonicalCity(value) || value),
      );
    }
  }, [p, q.data?.cities]);
  useEffect(() => {
    setBio(p?.description || "");
    setSavedBio(p?.description || "");
  }, [p?.id, p?.description]);
  return (
    <ArtisanPage
      rafi={bioAction.busy ? bioAction.rafi : a.busy || Number(a.rafi.eventKey) >= Number(bioAction.rafi.eventKey) ? a.rafi : bioAction.rafi}
      title="Votre signature professionnelle."
      eyebrow="MON PROFIL ARTISAN"
      activeKey="profile"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {p && (
        <>
          <ArtisanSection label="VOTRE PRÉSENCE FIXEO">
            <FixeoText variant="title">{p.name || "Artisan FIXEO"}</FixeoText>
            <FixeoText tone="secondary">
              {p.city} · {availabilityLabels[p.availability] || "À définir"}
            </FixeoText>
            {p.verified && <FixeoText>Profil vérifié par FIXEO</FixeoText>}
          </ArtisanSection>
          <ArtisanCue text="Présentez votre expérience, vos métiers et vos zones avec précision. Vos informations alimentent votre profil professionnel FIXEO." />
          <ArtisanField
            label="Téléphone professionnel"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <ArtisanField
            label="Métiers — séparés par des virgules"
            value={services}
            onChangeText={setServices}
          />
          <CityZonesField values={cities} onChange={setCities} disabled={a.busy} />
          <FixeoAction
            label="Enregistrer mon profil"
            busy={a.busy}
            onPress={() => {
              const s = services
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
                c = cities;
              if (!s.length || !c.length || !phone.trim()) {
                a.setMessage(
                  "Renseignez un téléphone, au moins un métier et une ville.",
                );
                return;
              }
              void a.run(async () => {
                await saveArtisanProfile(
                  {
                    phone,
                    services: s,
                    cities: c,
                  },
                  {
                    phone: p.phone_public || "",
                    services: p.services?.length
                      ? p.services
                      : [p.service_category],
                    cities: q.data!.cities.length ? q.data!.cities : [p.city],
                  },
                );
                await q.reload();
                return true;
              }, "Profil enregistré.");
            }}
          />
          <ArtisanSection label="VOTRE PRÉSENTATION">
            <ArtisanField
              label="Présentation professionnelle"
              value={bio}
              onChangeText={(value) => {
                setBio(value);
                bioAction.setMessage("");
              }}
              multiline
              maxLength={4000}
              editable={!bioAction.busy}
              placeholder="Votre expérience, votre savoir-faire et votre façon de travailler."
            />
            <FixeoText variant="supporting" tone="secondary">
              {Array.from(bio).length} / 4 000 caractères
            </FixeoText>
            <FixeoAction
              label="Enregistrer ma présentation"
              busyLabel="Enregistrement…"
              busy={bioAction.busy}
              disabled={bio.trim() === savedBio}
              onPress={() => {
                void bioAction.run(async () => {
                  const confirmed = await saveArtisanBio(bio);
                  setBio(confirmed.description);
                  setSavedBio(confirmed.description);
                  void q.reload();
                  return confirmed;
                }, "Présentation enregistrée.");
              }}
            />
            <ArtisanMessage message={bioAction.message} />
          </ArtisanSection>
          <ArtisanSection label="RÉPUTATION & PERFORMANCE">
            {[
              ["Missions terminées", p.completed_missions],
              ["Note", p.review_count && p.rating ? p.rating : null],
              ["Temps de réponse (min)", p.response_time_min],
              ["Taux d’acceptation", null],
              ["Fiabilité", null],
            ].map(([label, value]) => (
              <View key={String(label)} style={art.row}>
                <FixeoText>{label}</FixeoText>
                <FixeoText variant={value == null ? "supporting" : "heading"} tone={value == null ? "secondary" : "primary"} style={value == null ? { fontWeight: "400" } : undefined}>
                  {value == null ? "En cours de calcul" : String(value)}
                </FixeoText>
              </View>
            ))}
            {p.badge_label && <FixeoText>{p.badge_label}</FixeoText>}
          </ArtisanSection>
          <ArtisanSection label="GALERIE">
            {p.photo_url && /^https:\/\//.test(p.photo_url) ? (
              <Image
                source={{ uri: p.photo_url }}
                style={{ width: "100%", height: 200, borderRadius: 18 }}
                resizeMode="cover"
                accessibilityLabel="Photo du profil Artisan"
              />
            ) : (
              <FixeoText tone="secondary">
                Votre galerie sera enrichie avec vos réalisations. Aucune photo
                de réalisation n’est encore disponible ici.
              </FixeoText>
            )}
          </ArtisanSection>
        </>
      )}
      {q.data && !p && (
        <FixeoText>
          Votre compte ne possède pas encore de profil Artisan. Complétez
          l’inscription professionnelle avant de continuer.
        </FixeoText>
      )}
    </ArtisanPage>
  );
}
