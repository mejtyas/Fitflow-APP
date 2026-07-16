import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, ChevronRight, Inbox } from 'lucide-react-native';
import { colors, fonts, radius, shadow } from '@/constants/theme';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  safeBottom?: boolean;
  testID?: string;
}>;

export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  contentStyle,
  safeBottom = true,
  testID,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.screenContent, contentStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      testID={testID}
      style={styles.screen}
      edges={safeBottom ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
        <Text style={[styles.brandMarkText, compact && styles.brandMarkTextCompact]}>F</Text>
      </View>
      <Text style={[styles.brandText, compact && styles.brandTextCompact]}>
        FitFlow<Text style={styles.brandDot}>.</Text>
      </Text>
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        <View style={styles.titleRow}>
          {icon ? <View style={styles.titleIcon}>{icon}</View> : null}
          <Text style={styles.pageTitle}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children, style }: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  left,
  right,
  style,
  compact = false,
  accessibilityLabel,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const foreground =
    variant === 'primary'
      ? colors.primaryText
      : variant === 'destructive'
        ? colors.white
        : variant === 'ghost'
          ? colors.textMuted
          : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        styles[`button_${variant}`],
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} size="small" /> : left}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: foreground }]}>
        {title}
      </Text>
      {!loading ? right : null}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={containerStyle}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <SafeAreaView style={[styles.screen, styles.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </SafeAreaView>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <AlertCircle color={colors.destructive} size={18} />
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Inbox color={colors.textMuted} size={28} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

export function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
}) {
  return (
    <Card style={styles.statTile}>
      <View style={styles.statTop}>
        {icon}
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export function RowLink({
  title,
  subtitle,
  icon,
  onPress,
  destructive = false,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.rowLink, pressed && styles.pressed]}
    >
      {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && { color: colors.destructive }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <ChevronRight color={colors.textMuted} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, gap: 18 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow },
  brandMarkCompact: { width: 32, height: 32, borderRadius: radius.sm },
  brandMarkText: { color: colors.primaryText, fontFamily: fonts.sansBold, fontSize: 22 },
  brandMarkTextCompact: { fontSize: 17 },
  brandText: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 24 },
  brandTextCompact: { fontSize: 19 },
  brandDot: { color: colors.primary },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  pageHeaderText: { flex: 1, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 28, letterSpacing: -0.6 },
  pageSubtitle: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, ...shadow },
  label: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 7 },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1 },
  buttonCompact: { minHeight: 38, paddingHorizontal: 12, borderRadius: radius.sm },
  button_primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  button_secondary: { backgroundColor: colors.surface, borderColor: colors.surface },
  button_outline: { backgroundColor: colors.transparent, borderColor: colors.border },
  button_ghost: { backgroundColor: colors.transparent, borderColor: colors.transparent },
  button_destructive: { backgroundColor: colors.destructive, borderColor: colors.destructive },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
  buttonText: { fontFamily: fonts.sansSemibold, fontSize: 15 },
  buttonTextCompact: { fontSize: 13 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.sans, fontSize: 16 },
  inputMultiline: { minHeight: 112, paddingTop: 12, textAlignVertical: 'top' },
  fieldError: { color: colors.destructive, fontFamily: fonts.sans, fontSize: 12, marginTop: 6 },
  loadingText: { color: colors.textMuted, fontFamily: fonts.sansMedium, fontSize: 14 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderColor: colors.destructive, backgroundColor: colors.destructiveMuted, borderRadius: radius.md, padding: 12 },
  errorBannerText: { flex: 1, color: colors.destructive, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 38 },
  emptyIcon: { width: 58, height: 58, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17, textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320, marginBottom: 4 },
  statTile: { flex: 1, minWidth: 100, padding: 14 },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  statValue: { color: colors.text, fontFamily: fonts.monoSemibold, fontSize: 21 },
  statLabel: { color: colors.textMuted, fontFamily: fonts.monoMedium, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  rowLink: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 15 },
  rowSubtitle: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
});
