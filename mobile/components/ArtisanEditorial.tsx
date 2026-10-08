import { BackButton } from '@/ui/BackButton';
import { pageLayout } from '@/ui/pageLayout';
import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode, type Ref } from "react";
import { RafiSignalContext } from '@/ui/RafiSignal';
import { rafiActionState, type RafiSignal } from '@/ui/rafiPresence';
import {
  ActivityIndicator,
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
  const generation = useRef(0),
    pending = useRef(false),
    mounted = useRef(true);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const version = ++generation.current;
    setLoading(true);
    try {
      const value = await withMobileDeadline(fetcher(), 30000);
      if (mounted.current && generation.current === version) {
        setData(value);
        setError("");
      }
    } catch (e) {
      if (mounted.current && generation.current === version) {
        setData(null);
        setError(artisanError(e));
      }
    } finally {
      pending.current = false;
      if (mounted.current && generation.current === version) setLoading(false);
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
  useForegroundRefresh(load);
  return { data, loading, error, reload: load };
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
export function ArtisanPage({
  title,
  eyebrow = "ARTISAN OS",
  detail,
  activeKey,
  children,
  loading = false,
  onRefresh,
  dock,
  transactional: _transactional = false,
  rafi,
  back = true,
  hero,
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
}>) {
  const workspaceDock = useWorkspaceDock('artisan');
  const contextualItems = dock?.items.filter(item => !workspaceDock?.items.some(global => global.label === item.label)) || [];
  const accessibleDock = workspaceDock; // Global navigation is independent of contextual actions.
  return (
    <RafiSignalContext.Provider value={rafi || null}><FixeoScreen
      padded={false}
      contextDock={accessibleDock}
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
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={art.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={loading} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {back && <BackButton />}
        {hero}
        <View style={[art.intro, hero ? { alignItems: 'center', marginBottom: 8 } : undefined]}>
          {!hero && <View style={art.signature} />}
          <FixeoText variant="eyebrow" tone="secondary">
            {eyebrow}
          </FixeoText>
          <FixeoText variant="hero" accessibilityRole="header" style={hero ? { textAlign: 'center' } : undefined}>
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
        {children}
        {dock && !dock.hidden && <View accessibilityLabel="Actions de cette page" style={art.contextActions}>
          {contextualItems.map(item => <FixeoAction key={item.key} label={item.label} variant="secondary"
            accessibilityLabel={item.accessibilityLabel} disabled={item.disabled} onPress={item.action} style={art.choice} />)}
        </View>}
      </ScrollView>
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
      <RafiOrb size={44} />
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
  label, error, inputRef,
  ...props
}: TextInputProps & { label: string; error?: string; inputRef?: Ref<TextInput> }) {
  return (
    <View style={art.field}>
      <FixeoText variant="supporting">{label}</FixeoText>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={semanticColors.text.secondary}
        {...props}
        style={[
          art.input,
          error && { borderWidth: 2, borderColor: semanticColors.text.secondary },
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
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
  return (
    <View style={art.field}>
      <FixeoText variant="supporting">{label}</FixeoText>
      <View style={art.inline}>
        {options.map((o) => (
          <FixeoAction
            key={o.value}
            label={o.label}
            variant="secondary"
            selected={value === o.value}
            disabled={o.disabled}
            accessibilityState={{ selected: value === o.value, disabled: !!o.disabled }}
            onPress={() => onChange(o.value)}
            style={art.choice}
          />
        ))}
      </View>
    </View>
  );
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
  state: { status: "loading" | "ready" | "unavailable"; error: unknown };
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
