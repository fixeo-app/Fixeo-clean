import { View } from 'react-native';
import { router } from 'expo-router';
import { loadArtisanNotifications, markArtisanNotification, loadArtisanMissions } from '@/lib/artisanOS';
import { getDispatchOffers } from '@/lib/magicLoop';
import { artisanNotificationTarget } from '@/lib/artisanNotificationTarget';
import { when } from '@/lib/artisanExperience';
import { ArtisanPage, ArtisanEmpty, ArtisanMessage, useArtisanQuery, useArtisanAction, art } from '@/components/ArtisanEditorial';
import { FixeoText } from '@/ui/FixeoText';
import { FixeoAction } from '@/ui/FixeoAction';
const load = async () => {
  const [notifications, missions, offers] = await Promise.all([loadArtisanNotifications(), loadArtisanMissions(), getDispatchOffers()]);
  return { notifications, missions, offers };
};
export default function Notifications() {
  const q = useArtisanQuery(load), a = useArtisanAction();
  return <ArtisanPage title="Notifications" eyebrow="VOTRE ACTIVITÉ" activeKey="alerts" rafi={a.rafi}
    loading={q.loading} onRefresh={() => void q.reload()}
    list={{ data: q.data?.notifications || [], keyExtractor: n => n.id, renderItem: ({item:n}) => {
      const target = artisanNotificationTarget(n, q.data?.missions || [], q.data?.offers || []);
      return <View style={art.row}>
        <FixeoText variant="eyebrow" tone="secondary">{n.read ? 'LU' : 'NOUVEAU'} · {when(n.created_at)}</FixeoText>
        <FixeoText variant="heading">{n.title}</FixeoText><FixeoText tone="secondary">{n.message}</FixeoText>
        {target ? <FixeoAction label="Ouvrir l’élément" variant="ghost" onPress={() => router.push(target as any)} />
          : <FixeoText tone="secondary">Cet élément est terminé, indisponible ou sans destination accessible. La notification reste consultable ici.</FixeoText>}
        {!n.read && <FixeoAction label="Marquer comme lu" variant="ghost" disabled={a.busy} onPress={() => void a.run(async () => {
          await markArtisanNotification(n.id); await q.reload(); return true;
        }, 'Lecture enregistrée.')} />}
      </View>;
    } }}>
    <ArtisanMessage message={q.error || a.message} retry={q.error ? () => void q.reload() : undefined} />
    {q.data?.notifications.length === 0 && <ArtisanEmpty title="Tout est à jour." detail="Vos prochaines notifications FIXEO apparaîtront ici." />}
  </ArtisanPage>;
}
