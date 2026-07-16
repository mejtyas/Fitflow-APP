import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { colors, fonts, radius } from '@/constants/theme';
import { isLoggedSetReps } from '@/lib/validation';

const KG_RE = /^\d*\.?\d{0,2}$/;
const REPS_RE = /^\d*\.?\d?$/;

export function ActiveSetInput({
  value,
  field,
  completed,
  onChange,
  onBlur,
}: {
  value: number | null;
  field: 'kg' | 'reps';
  completed: boolean;
  onChange: (value: number | null) => void;
  onBlur: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const pattern = field === 'kg' ? KG_RE : REPS_RE;
  const parse = (raw: string) => {
    if (!raw) return null;
    if (raw.endsWith('.')) return undefined;
    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric) || numeric < 0) return undefined;
    if (field === 'reps') {
      const half = Math.round(numeric * 2) / 2;
      return isLoggedSetReps(half) ? half : undefined;
    }
    return Math.round(numeric * 100) / 100;
  };
  return (
    <TextInput
      accessibilityLabel={field === 'kg' ? 'Weight in kilograms' : 'Repetitions'}
      value={editing ? draft : value === null ? '' : String(value)}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder="0"
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.primary}
      onFocus={() => {
        setDraft(value === null ? '' : String(value));
        setEditing(true);
      }}
      onChangeText={(raw) => {
        if (!pattern.test(raw)) return;
        setDraft(raw);
        const parsed = parse(raw);
        if (parsed !== undefined) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = parse(draft);
        if (parsed !== undefined) onChange(parsed);
        setEditing(false);
        onBlur();
      }}
      style={[styles.input, completed && styles.completed]}
    />
  );
}

const styles = StyleSheet.create({
  input: { height: 45, minWidth: 74, flex: 1, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, color: colors.text, textAlign: 'center', fontFamily: fonts.monoSemibold, fontSize: 15 },
  completed: { backgroundColor: colors.transparent, color: colors.textMuted, textDecorationLine: 'line-through' },
});
