import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { acceptDispatchOffer, getDispatchOffers } from '@/lib/magicLoop';
import type { DispatchOffer } from '@/lib/dispatchContract';
import { getMyCurrentArtisanMission, type MissionSnapshot } from '@/lib/missionTerrain';
import { PushOptIn } from '@/components/PushOptIn';
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
import {
  getArtisanWorkspaceSummary,
  type ArtisanWorkspaceSummary,
} from '@/lib/artisanWorkspace';
import { WorkspaceShortcutGrid } from '@/components/WorkspaceShortcutGrid';
import { shouldShowArtisanActivityLoadError } from '@/lib/artisanActivityLoad';

const ACCEPT_MESSAGES: Record<string, string> = {
  already_claimed: 'Cette demande a déjà été prise en charge.',
  offer_not_found: 'Cette opportunité n’est plus disponible.',
  offer_not_active: 'Cette opportunité n’est plus active.',
  artisan_not_found: 'Profil artisan introuvable.',
  unauthenticated: 'Votre session a expiré.',
};

const ACTIVE_LABELS: Record<string, string> = {
  assigned: 'Mission acceptée',
  in_progress: 'Intervention en cours',
  completed: 'Validation client en attente',
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
      eyebrow: 'FIXEO ARTISAN',
      title: 'Vous êtes prêt.',
      subtitle: 'FIXEO vous prévient dès qu’une opportunité pertinente arrive.',
      orb: 'idle' as const,
    };
  }, [currentMission, offers.length]);

  const header = (
    <View style={styles.headerStack}>
      <View style={styles.hero}>
        <Text style={styles.brand}>FIXEO ARTISAN</Text>
        <RafiOrb mode={cockpit.orb} size={76} />
        <Text style={styles.eyebrow}>{cockpit.eyebrow}</Text>
        <Text style={styles.title}>{cockpit.title}</Text>
        <Text style={styles.subtitle}>{cockpit.subtitle}</Text>
      </View>

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

      {!!decisionCue && (
        <DecisionCueCard
          cue={decisionCue}
          onAction={() => void actOnDecision(decisionCue)}
        />
      )}

      {!!currentMission && !decisionCue && (
        <FixeoCard tone="dark" style={styles.activeCard}>
          <Text style={styles.activeEyebrow}>MISSION EN COURS</Text>
          <Text style={styles.activeTitle}>{currentMission.service_category || 'Mission FIXEO'}</Text>
          <Text style={styles.activeMeta}>
            {currentMission.city || ''} · {ACTIVE_LABELS[currentMission.request_status] || 'Suivi FIXEO'}
          </Text>
          <FixeoAction
            label="Ouvrir la mission"
            variant="secondary"
            onPress={() => router.push({
              pathname: '/mission/[id]',
              params: { id: currentMission.mission_id },
            } as any)}
          />
        </FixeoCard>
      )}


      <View style={styles.sectionIntro}>
        <Text style={styles.sectionTitle}>Votre activité</Text>
        <Text style={styles.sectionHint}>Les outils professionnels restent accessibles sans alourdir votre cockpit.</Text>
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
            key: 'availability',
            label: 'Disponibilité',
            meta: workspaceSummary?.availability || 'À définir',
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
            <Text style={styles.emptyTitle}>Rien à faire pour l’instant.</Text>
            <Text style={styles.empty}>
              Gardez les alertes activées. FIXEO vous prévient dès qu’une mission correspond.
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
