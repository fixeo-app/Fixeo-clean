import { View } from "react-native";
import { router } from "expo-router";
import {
  loadArtisanNotifications,
  markArtisanNotification,
  loadArtisanMissions,
} from "@/lib/artisanOS";
import { when } from "@/lib/artisanExperience";
import {
  ArtisanPage,
  ArtisanEmpty,
  ArtisanMessage,
  useArtisanQuery,
  useArtisanAction,
  art,
} from "@/components/ArtisanEditorial";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
const load = async () => {
  const [notifications, missions] = await Promise.all([
    loadArtisanNotifications(),
    loadArtisanMissions(),
  ]);
  return { notifications, missions };
};
export default function Notifications() {
  const q = useArtisanQuery(load),
    a = useArtisanAction();
  return (
    <ArtisanPage
      title="Gardez le fil."
      eyebrow="VOS NOTIFICATIONS"
      activeKey="alerts"
      loading={q.loading}
      onRefresh={() => void q.reload()}
    >
      <ArtisanMessage
        message={q.error || a.message}
        retry={q.error ? () => void q.reload() : undefined}
      />
      {q.data?.notifications.map((n) => {
        const mission = q.data?.missions.find(
          (m) =>
            m.mission_id === n.related_entity_id ||
            m.request_id === n.related_entity_id,
        );
        return (
          <View style={art.row} key={n.id}>
            <FixeoText variant="eyebrow" tone="secondary">
              {n.read ? "LU" : "NOUVEAU"} · {when(n.created_at)}
            </FixeoText>
            <FixeoText variant="heading">{n.title}</FixeoText>
            <FixeoText tone="secondary">{n.message}</FixeoText>
            {!n.read && (
              <FixeoAction
                label="Marquer comme lu"
                variant="ghost"
                disabled={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    await markArtisanNotification(n.id);
                    await q.reload();
                    return true;
                  }, "Notification lue.")
                }
              />
            )}
            <FixeoAction
              label={mission ? "Ouvrir la mission" : "Voir mon activité"}
              variant="secondary"
              onPress={() =>
                mission
                  ? router.push({
                      pathname: "/mission/[id]",
                      params: { id: mission.mission_id },
                    })
                  : router.push("/artisan")
              }
            />
          </View>
        );
      })}
      {q.data?.notifications.length === 0 && (
        <ArtisanEmpty
          title="Tout est à jour."
          detail="Vos prochaines notifications FIXEO apparaîtront ici."
        />
      )}
    </ArtisanPage>
  );
}
