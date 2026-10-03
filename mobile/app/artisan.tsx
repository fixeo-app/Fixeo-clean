import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { acceptDispatchOffer, getDispatchOffers } from '@/lib/magicLoop';
import { triggerFixeoFeedback } from '@/lib/feedback';
import type { DispatchOffer } from '@/lib/dispatchContract';
import { getMyCurrentArtisanMission, type MissionSnapshot } from '@/lib/missionTerrain';
import { PushOptIn } from '@/components/PushOptIn';
import { MobileShell } from '@/components/MobileShell';
import { DecisionCueCard } from '@/components/DecisionCueCard';
import {
  getMyMobileDecisionContext,
  type MobileDecisionCue,
} from '@/lib/decisionCenter';
import { FixeoAction } from '@/ui/FixeoAction';
import { FixeoCard } from '@/ui/FixeoCard';
import { FixeoScreen } from '@/ui/FixeoScreen';
import { RafiOrb } from '@/ui/RafiOrb';
import { colors, radius, spacing, type } from '@/ui/tokens';
import { getArtisanContextualCockpit } from '@/lib/contextualCockpit';
import {
  getArtisanWorkspaceSummary,
  type ArtisanWorkspaceSummary,
} from '@/lib/artisanWorkspace';
import { WorkspaceShortcutGrid } from '@/components/WorkspaceShortcutGrid';
import { ContextualCockpitCard } from '@/components/ContextualCockpitCard';
import { shouldShowArtisanActivityLoadError } from '@/lib/artisanActivityLoad';

const ACCEPT_MESSAGES: Record<string, string> = {
  already_claimed: 'Cette demande a déjà été prise en charge.',
  offer_not_found: 'Cette opportunité n’est plus disponible.',
  offer_not_active: 'Cette opportunité n’est plus active.',
  artisan_not_found: 'Profil artisan introuvable.',
  unauthenticated: 'Votre session a expiré.',
};

const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Disponible',
  busy: 'Occupé',
  unavailable: 'Indisponible',
};

export default function Artisan() {
  const [offers, setOffers] = useState<DispatchOffer[]>([]);
  const [currentMission, setCurrentMission] = useState<MissionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [activityLoadError, setActivityLoadError] = useState(false);
  const [decisionCue, setDecisionCue] = useState<MobileDecisionCue | null>(null);
  const [workspaceSummary, setWorkspaceSummary] = useState<ArtisanWorkspaceSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [offersResult, missionResult, decision, workspace] = await Promise.all([
        getDispatchOffers()
          .then(value => ({ ok: true as const, value }))
          .catch(() => ({ ok: false as const, value: null })),
        getMyCurrentArtisanMission()
          .then(value => ({ ok: true as const, value }))
          .catch(() => ({ ok: false as const, value: null })),
        getMyMobileDecisionContext().catch(() => null),
        getArtisanWorkspaceSummary().catch(() => null),
      ]);

      if (offersResult.ok) setOffers(offersResult.value);
      if (missionResult.ok) setCurrentMission(missionResult.value);
      setDecisionCue(decision?.cue || null);
      setWorkspaceSummary(workspace);
      setActivityLoadError(
        shouldShowArtisanActivityLoadError(offersResult.ok, missionResult.ok),
      );
    } catch {
      setActivityLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [load]);

  async function actOnDecision(cue: MobileDecisionCue) {
    if (cue.action.kind === 'open_mission') {
      router.push({
        pathname: '/mission/[id]',
        params: { id: cue.action.mission_id },
      } as any);
      return;
    }
    if (cue.action.kind === 'accept_offer') {
      await accept(cue.action.request_id);
    }
  }

  async function accept(requestId: string) {
    if (acceptingRequestId) return;
    setAcceptingRequestId(requestId);
    try {
      setMessage('FIXEO sécurise la mission…');
      const result = await acceptDispatchOffer(requestId);
      triggerFixeoFeedback('success');
      setMessage(result.reason === 'already_accepted' ? 'Mission déjà acceptée.' : '✓ Mission acceptée.');
      await load();
      const missionId = String(result?.mission_id || '');
      if (missionId) {
        router.push({ pathname: '/mission/[id]', params: { id: missionId } } as any);
      }
    } catch (error: any) {
      const reason = String(error?.message || 'accept_failed');
      setMessage(ACCEPT_MESSAGES[reason] || 'Impossible d’accepter cette mission.');
      await load();
    } finally {
      setAcceptingRequestId(null);
    }
  }

  const cockpit = useMemo(() => {
    if (currentMission?.request_status === 'in_progress') {
      return {
        eyebrow: 'MISSION EN COURS',
        title: 'Restez concentré sur l’intervention.',
        subtitle: 'RAFI garde le contexte et FIXEO suit les prochaines étapes.',
        orb: 'working' as const,
      };
    }
    if (currentMission?.request_status === 'completed') {
      return {
        eyebrow: 'VALIDATION CLIENT',
        title: 'Intervention terminée.',
        subtitle: 'FIXEO attend la confirmation finale du client.',
        orb: 'success' as const,
      };
    }
    if (currentMission) {
      return {
        eyebrow: 'PROCHAINE ACTION',
        title: 'Une mission vous attend.',
        subtitle: 'Ouvrez-la et laissez FIXEO vous guider jusqu’à la clôture.',
        orb: 'success' as const,
      };
    }
    if (offers.length > 0) {
      return {
        eyebrow: 'OPPORTUNITÉS',
        title: 'De nouvelles missions sont disponibles.',
        subtitle: 'La meilleure opportunité est déjà remontée pour vous.',
        orb: 'working' as const,
      };
    }
    return {
      eyebrow: 'COCKPIT ARTISAN',
      title: 'Vous êtes prêt.',
      subtitle: 'FIXEO surveille les opportunités pendant que vous gardez votre activité sous contrôle.',
      orb: 'idle' as const,
    };
  }, [currentMission, offers.length]);

  const availabilityLabel = workspaceSummary?.availability
    ? AVAILABILITY_LABELS[workspaceSummary.availability] || 'À définir'
    : 'À définir';

  const contextualCockpit = useMemo(
    () => getArtisanContextualCockpit({
      missionStatus: currentMission?.request_status,
      offersCount: offers.length,
      availability: workspaceSummary?.availability,
      jobsCount: workspaceSummary?.jobs ?? 0,
      quotesCount: workspaceSummary?.quotes ?? 0,
      missionSubject: currentMission?.service_category,
      missionCity: currentMission?.city,
    }),
    [
      currentMission?.request_status,
      currentMission?.service_category,
      currentMission?.city,
      offers.length,
      workspaceSummary?.availability,
      workspaceSummary?.jobs,
      workspaceSummary?.quotes,
    ],
  );

  function actOnContextualCockpit() {
    if (contextualCockpit.action === 'artisan_mission' && currentMission) {
      router.push({
        pathname: '/mission/[id]',
        params: { id: currentMission.mission_id },
      } as any);
      return;
    }

    if (contextualCockpit.action === 'artisan_agenda') {
      router.push('/artisan-workspace/agenda');
      return;
    }

    if (contextualCockpit.action === 'artisan_workspace') {
      router.push('/artisan-workspace');
    }
  }

  const header = (
    <View style={styles.headerStack}>
      <MobileShell
        universe="artisan"
        activeKey="cockpit"
        orbMode={cockpit.orb}
        statusLabel={currentMission ? 'Mission active' : availabilityLabel}
        rightActionLabel="Artisan OS"
        onRightAction={() => router.push('/artisan-workspace')}
      />
      <View style={styles.hero}>
        <RafiOrb mode={cockpit.orb} size={76} />
        <Text style={styles.eyebrow}>{cockpit.eyebrow}</Text>
        <Text style={styles.title}>{cockpit.title}</Text>
        <Text style={styles.subtitle}>{cockpit.subtitle}</Text>
      </View>

      {decisionCue ? (
        <DecisionCueCard
          cue={decisionCue}
          onAction={() => void actOnDecision(decisionCue)}
        />
      ) : (
        <ContextualCockpitCard
          model={contextualCockpit}
          onAction={actOnContextualCockpit}
        />
      )}

      {!currentMission && (
        <FixeoCard tone="dark" style={styles.liveCard}>
          <Text style={styles.liveEyebrow}>COCKPIT LIVE</Text>
          <View style={styles.liveMetrics}>
            <View style={styles.liveMetric}>
              <Text style={styles.liveValue}>{availabilityLabel}</Text>
              <Text style={styles.liveLabel}>Disponibilité</Text>
            </View>
            <View style={styles.liveMetric}>
              <Text style={styles.liveValue}>{offers.length}</Text>
              <Text style={styles.liveLabel}>Opportunités</Text>
            </View>
            <View style={styles.liveMetric}>
              <Text style={styles.liveValue}>{workspaceSummary?.clients ?? 0}</Text>
              <Text style={styles.liveLabel}>Clients</Text>
            </View>
          </View>
        </FixeoCard>
      )}

      {activityLoadError && (
        <FixeoCard tone="muted" style={styles.messageCard}>
          <Text style={styles.message}>Impossible de charger votre activité FIXEO.</Text>
        </FixeoCard>
      )}

      {!!message && (
        <FixeoCard tone="muted" style={styles.messageCard}>
          <Text style={styles.message}>{message}</Text>
        </FixeoCard>
      )}

      <View style={styles.sectionIntro}>
        <Text style={styles.sectionTitle}>Votre cockpit professionnel</Text>
        <Text style={styles.sectionHint}>Les actions utiles sont à portée de pouce. Le reste reste dans Artisan OS.</Text>
      </View>

      <WorkspaceShortcutGrid
        items={[
          {
            key: 'workspace',
            label: 'Artisan OS',
            meta: workspaceSummary
              ? `${workspaceSummary.clients} clients · ${workspaceSummary.quotes} devis`
              : 'Clients · Devis · Agenda · Finance',
            onPress: () => router.push('/artisan-workspace'),
          },
          {
            key: 'agenda',
            label: 'Agenda',
            meta: `${workspaceSummary?.jobs ?? 0} intervention${workspaceSummary?.jobs === 1 ? '' : 's'}`,
            onPress: () => router.push('/artisan-workspace/agenda'),
          },
          {
            key: 'quotes',
            label: 'Devis',
            meta: `${workspaceSummary?.quotes ?? 0} devis`,
            onPress: () => router.push('/artisan-workspace/quotes'),
          },
          {
            key: 'availability',
            label: 'Disponibilité',
            meta: availabilityLabel,
            onPress: () => router.push('/artisan-workspace'),
          },
        ]}
      />

      <View style={styles.sectionIntro}>
        <Text style={styles.sectionTitle}>Opportunités maintenant</Text>
        <Text style={styles.sectionHint}>
          {offers.length > 0
            ? `${offers.length} mission${offers.length > 1 ? 's' : ''} disponible${offers.length > 1 ? 's' : ''}`
            : 'Aucune mission à traiter pour le moment'}
        </Text>
      </View>
    </View>
  );

  return (
    <FixeoScreen padded={false}>
      <FlatList
        data={offers}
        keyExtractor={(item) => item.request_id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <FixeoCard tone="muted" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Vous êtes en veille.</Text>
            <Text style={styles.empty}>
              Rien à traiter maintenant. Gardez les alertes actives : FIXEO vous remettra en mouvement dès qu’une mission correspond.
            </Text>
          </FixeoCard>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <PushOptIn compact />
          </View>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const accepting = acceptingRequestId === item.request_id;
          return (
            <FixeoCard style={styles.card}>
              <View style={styles.offerTop}>
                <View style={styles.offerText}>
                  <Text style={styles.heading}>{item.service_category || 'Mission FIXEO'}</Text>
                  <Text style={styles.city}>
                    {item.city || ''}{item.urgency ? ' · ' + item.urgency : ''}
                  </Text>
                </View>
                <View style={styles.rankPill}>
                  <Text style={styles.rankText}>#{item.match_rank ?? '—'}</Text>
                </View>
              </View>

              <Text style={styles.meta}>Cette opportunité correspond à votre profil FIXEO.</Text>

              <FixeoAction
                label={accepting ? 'Sécurisation de la mission…' : 'Accepter la mission'}
                disabled={!!acceptingRequestId}
                onPress={() => void accept(item.request_id)}
              />
            </FixeoCard>
          );
        }}
      />
    </FixeoScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerStack: {
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  brand: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3.2,
    color: colors.text,
  },
  eyebrow: {
    marginTop: spacing.xs,
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textAlign: 'center',
  },
  title: {
    maxWidth: 340,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 330,
    fontSize: type.body,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
  },
  liveCard: {
    gap: spacing.md,
  },
  liveEyebrow: {
    color: '#A8A8AC',
    fontSize: type.eyebrow,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  liveMetrics: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  liveMetric: {
    flex: 1,
    gap: spacing.xs,
  },
  liveValue: {
    color: colors.inverse,
    fontSize: 18,
    fontWeight: '900',
  },
  liveLabel: {
    color: '#BFC0C4',
    fontSize: 12,
    fontWeight: '700',
  },
  messageCard: {
    paddingVertical: spacing.md,
  },
  message: {
    textAlign: 'center',
    fontWeight: '800',
    color: colors.text,
  },
  activeCard: {
    gap: spacing.md,
  },
  activeEyebrow: {
    color: '#9B9B9F',
    fontWeight: '900',
    letterSpacing: 1.4,
    fontSize: type.eyebrow,
  },
  activeTitle: {
    color: colors.inverse,
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: -0.6,
  },
  activeMeta: {
    color: '#D8D8DA',
    fontSize: type.body,
  },
  sectionIntro: {
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  sectionHint: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  emptyCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.text,
  },
  empty: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  card: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  offerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  offerText: {
    flex: 1,
    gap: spacing.xs,
  },
  heading: {
    fontSize: 23,
    fontWeight: '900',
    color: colors.text,
  },
  city: {
    fontSize: type.body,
    color: colors.textMuted,
  },
  rankPill: {
    minWidth: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  rankText: {
    color: colors.inverse,
    fontWeight: '900',
  },
  meta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  footer: {
    paddingTop: spacing.lg,
  },
});
