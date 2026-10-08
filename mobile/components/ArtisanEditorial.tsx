import { ChoicePicker } from '@/ui/ChoicePicker';
import { onSessionRejected, privateSessionGeneration } from '@/lib/authEvents';
import { BackButton } from '@/ui/BackButton';
import { pageLayout } from '@/ui/pageLayout';
import { RafiScrollView as ScrollView, useKeyboardField } from '@/ui/RafiScrollView';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode, type Ref } from "react";
import { RafiSignalContext } from '@/ui/RafiSignal';
import { rafiActionState, type RafiSignal } from '@/ui/rafiPresence';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FixeoText } from "@/ui/FixeoText";
import { FixeoAction } from "@/ui/FixeoAction";
import { FixeoScreen } from "@/ui/FixeoScreen";
import { RafiOrb } from "@/ui/RafiOrb";
import { MobileShell } from "./MobileShell";
import { useWorkspaceDock } from './useWorkspaceDock';
import {
  radii,
  semanticColors,
  space,
  typography,
} from "@/ui/tokens";
import type { ContextDockSpec } from "@/ui/shellContract";
import { artisanError } from "@/lib/artisanExperience";
import { withMobileDeadline } from "@/lib/mobileResilience";
import { useForegroundRefresh } from "@/lib/useForegroundRefresh";

export function useArtisanQuery<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const lastSuccess = useRef<string | null>(null);
  const querySource = useRef(fetcher);
  const generation = useRef(0),
    pending = useRef(false),
    mounted = useRef(true);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    if (querySource.current !== fetcher) { querySource.current = fetcher; setData(null); lastSuccess.current = null; setLastUpdatedAt(null); }
    const version = ++generation.current, session = privateSessionGeneration();
    setLoading(true);
    try {
      const value = await withMobileDeadline(fetcher(), 30000);
      if (mounted.current && generation.current === version && session === privateSessionGeneration()) {
        setData(value);
        lastSuccess.current = new Date().toISOString(); setLastUpdatedAt(lastSuccess.current);
        setError("");
      }
    } catch (e) {
      if (mounted.current && generation.current === version && session === privateSessionGeneration()) {
        if (/AUTH_REQUIRED|SESSION_REVOKED|UNAUTHENTICATED|JWT|ARTISAN_REQUIRED|artisan_role_required|42501|permission denied/i.test(String((e as { message?: string; code?: string })?.message || '') + String((e as { code?: string })?.code || ''))) {
          setData(null); lastSuccess.current = null; setLastUpdatedAt(null);
        }
        setError(artisanError(e) + (lastSuccess.current ? ` Dernières données reçues le ${new Date(lastSuccess.current).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} (Maroc).` : ''));
      }
    } finally {
      pending.current = false;
      if (mounted.current && generation.current === version && session === privateSessionGeneration()) setLoading(false);
    }
  }, [fetcher]);
  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      void load();
      return () => {
        mounted.current = false;
        ++generation.current;
        pending.current = false;
      };
    }, [load]),
  );
  useEffect(() => onSessionRejected(() => { ++generation.current; pending.current = false; lastSuccess.current = null; setData(null); setLastUpdatedAt(null); setError('Votre session a expiré.'); }), []);
  useForegroundRefresh(load);
  return { data, loading, error, lastUpdatedAt, reload: load };
}
export function useArtisanAction() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const locked = useRef(false);
  const alive = useRef(true);
  const [completion, setCompletion] = useState(0), [failed, setFailed] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = async <T,>(
    action: () => Promise<T>,
    success: string,
    timeoutMs = 20000,
  ): Promise<T | undefined> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const value = await withMobileDeadline(action(), timeoutMs);
      if (alive.current) { setMessage(success); setCompletion(value => Math.max(Date.now(), value + 1)); }
      return value;
    } catch (e) {
      if (alive.current) { setMessage(artisanError(e)); setFailed(true); }
      return undefined;
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const rafi: RafiSignal = { mode: rafiActionState(busy, failed, completion), eventKey: String(completion) };
  return { busy, message, setMessage, run, rafi };
}
export function ArtisanPage<T,>({
  title,
  eyebrow = "ARTISAN OS",
  detail,
  activeKey,
  children,
  loading = false,
  onRefresh,
  dock,
  transactional = false,
  rafi,
  back = true,
  hero,
  list,
  backAction,
}: PropsWithChildren<{
  title: string;
  eyebrow?: string;
  detail?: string;
  activeKey: string;
  loading?: boolean;
  onRefresh?: () => void;
  dock?: ContextDockSpec;
  transactional?: boolean;
  rafi?: RafiSignal;
  back?: boolean;
  hero?: ReactNode;
  backAction?: () => void;
  list?: { data: readonly T[]; renderItem: ListRenderItem<T>; keyExtractor: (item: T, index: number) => string };
}>) {
  const workspaceDock = useWorkspaceDock('artisan');
  const contextualItems = dock?.items.filter(item => !workspaceDock?.items.some(global => global.label === item.label)) || [];
  const accessibleDock = workspaceDock; // Global navigation is independent of contextual actions.
  const header = <>
        {back && <BackButton onPress={backAction} />}
        {hero}
        <View style={[art.intro, hero ? { alignItems: 'center', marginBottom: 8 } : undefined]}>
          {!hero && <View style={art.signature} />}
          <FixeoText variant="eyebrow" tone="secondary">
            {eyebrow}
          </FixeoText>
          <FixeoText variant="title" accessibilityRole="header" style={hero ? { textAlign: 'center' } : undefined}>
            {title}
          </FixeoText>
          {detail && <FixeoText tone="secondary" style={hero ? { textAlign: 'center' } : undefined}>{detail}</FixeoText>}
        </View>
        {loading && (
          <View style={art.loading}>
            <ActivityIndicator color={semanticColors.text.primary} />
            <FixeoText variant="supporting" accessibilityLiveRegion="polite">
              Actualisation de votre activité…
            </FixeoText>
          </View>
        )}
        {dock && !dock.hidden && <View accessibilityLabel="Actions de cette page" style={art.contextActions}>
          {contextualItems.map(item => <FixeoAction key={item.key} label={item.label} variant="secondary"
            accessibilityLabel={item.accessibilityLabel} disabled={item.disabled} onPress={item.action} style={art.choice} />)}
        </View>}
        {children}


  </>;
  return (
    <RafiSignalContext.Provider value={rafi || null}><FixeoScreen
      padded={false}
      contextDock={accessibleDock}
      transactional={transactional}
      header={
        <MobileShell
          universe="artisan"
          activeKey={activeKey}
          rightNavigation="detail"
          rightActionLabel="Notifications Artisan"
          rightActionIcon="notifications-outline"
          onRightAction={() =>
            router.push("/artisan-workspace/notifications" as any)
          }
        />
      }
    >
      {list ? <FlatList data={list.data} renderItem={list.renderItem} keyExtractor={list.keyExtractor}
        ListHeaderComponent={header} contentContainerStyle={art.content} initialNumToRender={6} windowSize={7}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        renderScrollComponent={props => <ScrollView {...props} />}
        refreshControl={onRefresh ? <RefreshControl refreshing={loading} onRefresh={onRefresh} /> : undefined} />
        : <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={art.content}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          refreshControl={onRefresh ? <RefreshControl refreshing={loading} onRefresh={onRefresh} /> : undefined}>{header}</ScrollView>}

    </FixeoScreen></RafiSignalContext.Provider>
  );
}
export function ArtisanSection({
  label,
  children,
  dark = false,
  testID,
}: PropsWithChildren<{ label?: string; dark?: boolean; testID?: string }>) {
  return (
    <View testID={testID} style={[art.section, dark && art.dark]}>
      {label && (
        <FixeoText
          variant="eyebrow"
          tone={dark ? "inverseSecondary" : "secondary"}
        >
          {label}
        </FixeoText>
      )}
      {children}
    </View>
  );
}
export function ArtisanCue({
  text,
  title = "RAFI · Votre prochaine décision",
}: {
  text: string;
  title?: string;
}) {
  return (
    <View style={art.cue}>
      <RafiOrb size={32} />
      <View style={art.flex}>
        <FixeoText variant="eyebrow">{title}</FixeoText>
        <FixeoText tone="secondary">{text}</FixeoText>
      </View>
    </View>
  );
}
export function ArtisanEmpty({
  title,
  detail,
  action,
  onPress,
}: {
  title: string;
  detail: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={art.empty}>
      <FixeoText variant="heading">{title}</FixeoText>
      <FixeoText tone="secondary">{detail}</FixeoText>
      {action && (
        <FixeoAction label={action} variant="secondary" onPress={onPress} />
      )}
    </View>
  );
}
export function ArtisanMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  if (!message) return null;
  return (
    <View style={art.message}>
      <FixeoText accessibilityLiveRegion="polite">{message}</FixeoText>
      {/session a expiré/.test(message) ? (
        <FixeoAction
          label="Se reconnecter"
          variant="secondary"
          onPress={() => router.replace("/sign-in")}
        />
      ) : (
        retry && (
          <FixeoAction label="Réessayer" variant="secondary" onPress={retry} />
        )
      )}
    </View>
  );
}
export function ArtisanField({
  label, error, inputRef, hint,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string; inputRef?: Ref<TextInput> }) {
  const field = useRef<View>(null);
  const keyboard = useKeyboardField();
  return (
    <View ref={field} collapsable={false} style={art.field}>
      <FixeoText variant="supporting">{label}</FixeoText>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={semanticColors.text.secondary}
        {...props}
        onFocus={event => { keyboard?.focus(field); props.onFocus?.(event); }}
        onBlur={event => { keyboard?.blur(field); props.onBlur?.(event); }}
        onContentSizeChange={event => { keyboard?.reveal(); props.onContentSizeChange?.(event); }}
        onSelectionChange={event => { keyboard?.reveal(); props.onSelectionChange?.(event); }}
        onLayout={event => { keyboard?.reveal(); props.onLayout?.(event); }}
        style={[
          art.input,
          error && { borderWidth: 2, borderColor: semanticColors.text.secondary },
          props.style,
          props.multiline && { minHeight: 56, maxHeight: 144, textAlignVertical: "top" },
        ]}
      />
      {!!hint && <FixeoText variant="supporting" tone="secondary">{hint}</FixeoText>}
      {error && <FixeoText accessibilityRole="alert" accessibilityLiveRegion="polite">ⓘ {error}</FixeoText>}
    </View>
  );
}
export function ArtisanChoices({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return <ChoicePicker label={label} options={options} value={value} onChange={v => onChange(String(v))} />;
}
export const art = StyleSheet.create({
  content: pageLayout.content,
  intro: pageLayout.intro,
  signature: pageLayout.signature,
  section: {
    padding: space.lg,
    gap: space.md,
    backgroundColor: semanticColors.background.surface,
    borderRadius: radii.card,
  },
  dark: { backgroundColor: semanticColors.background.focus },
  row: {
    paddingVertical: space.md,
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border.subtle,
  },
  flex: { flex: 1, minWidth: 0, gap: space.sm },
  cue: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.sm,
  },
  empty: { gap: space.md, paddingVertical: space.lg },
  message: {
    gap: space.sm,
    padding: space.md,
    backgroundColor: semanticColors.background.surface,
    borderRadius: radii.control,
  },
  field: { gap: space.sm },
  input: {
    ...typography.body,
    color: semanticColors.text.primary,
    minHeight: 56,
    padding: space.md,
    backgroundColor: semanticColors.background.surface,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
  },
  actions: { gap: space.sm },
  contextActions: { gap: space.sm, paddingVertical: space.md },
  inline: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  back: { alignSelf: "flex-start", minWidth: 80 },
  choice: { flexGrow: 1 },
  loading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  link: { minHeight: 48, justifyContent: "center" },
  inverse: { color: semanticColors.text.inverse },
  muted: { color: semanticColors.text.secondary },
});

export function ArtisanModuleStatus({
  label,
  state,
  retry,
  testID,
}: {
  label: string;
  state: { status: "loading" | "ready" | "unavailable"; error: unknown; lastUpdatedAt?: string };
  retry: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} accessibilityLabel={`${label} : ${state.status}`}>
      {state.status === "loading" && (
        <View style={art.loading}>
          <ActivityIndicator
            size="small"
            color={semanticColors.text.secondary}
          />
          <FixeoText
            variant="supporting"
            tone="secondary"
            accessibilityLiveRegion="polite"
          >
            {label} · Actualisation…
          </FixeoText>
        </View>
      )}
      {state.status === "unavailable" && (
        <View style={art.actions}>
          <FixeoText tone="secondary">
            {label} indisponible pour le moment. {artisanError(state.error)}
            {state.lastUpdatedAt ? ` Dernier état reçu le ${new Date(state.lastUpdatedAt).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} (Maroc).` : ''}
          </FixeoText>
          <FixeoAction
            label={`Réessayer · ${label}`}
            variant="ghost"
            onPress={retry}
          />
        </View>
      )}
    </View>
  );
}
