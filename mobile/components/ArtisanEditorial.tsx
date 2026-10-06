import { RafiScrollView as ScrollView } from '@/ui/RafiScrollView';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
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
  layout,
  radii,
  rafiVisualTokens,
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
  ): Promise<T | undefined> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const value = await withMobileDeadline(action(), 20000);
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
  transactional = false,
  rafi,
  back = true,
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
}>) {
  const workspaceDock = useWorkspaceDock('artisan');
  const activeDock = workspaceDock.items.length ? workspaceDock : dock;
  const accessibleDock = activeDock && { ...activeDock, hidden: transactional || activeDock.hidden };
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
        contentContainerStyle={art.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={loading} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {back && (
          <FixeoAction
            label="Retour"
            variant="ghost"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/artisan")
            }
            style={art.back}
          />
        )}
        <View style={art.intro}>
          <View style={art.signature} />
          <FixeoText variant="eyebrow" tone="secondary">
            {eyebrow}
          </FixeoText>
          <FixeoText variant="hero" accessibilityRole="header">
            {title}
          </FixeoText>
          {detail && <FixeoText tone="secondary">{detail}</FixeoText>}
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
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={art.field}>
      <FixeoText variant="supporting">{label}</FixeoText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={semanticColors.text.secondary}
        {...props}
        style={[
          art.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
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
  options: { value: string; label: string }[];
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
            variant={value === o.value ? "primary" : "secondary"}
            accessibilityState={{ selected: value === o.value }}
            onPress={() => onChange(o.value)}
            style={art.choice}
          />
        ))}
      </View>
    </View>
  );
}
export const art = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.xl,
    width: "100%",
    maxWidth: layout.screen.maxContentWidth,
    alignSelf: "center",
  },
  intro: { paddingTop: space.sm, gap: space.sm },
  signature: {
    width: 40,
    height: 2,
    backgroundColor: rafiVisualTokens.champagne,
    marginBottom: space.sm,
  },
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
