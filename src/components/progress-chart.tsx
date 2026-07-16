import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '@/constants/theme';
import type { ExerciseProgressPoint } from '@/services/exercises';

export type ProgressMetric = 'maxKg' | 'volume' | 'estimatedOneRm';

export function ProgressChart({ points, metric }: { points: ExerciseProgressPoint[]; metric: ProgressMetric }) {
  const values = points.map((point) => point[metric]);
  const max = Math.max(1, ...values);
  const coordinates = useMemo(
    () =>
      points.map((point, index) => ({
        x: points.length <= 1 ? 160 : 18 + (index / (points.length - 1)) * 284,
        y: 125 - (point[metric] / max) * 102,
        point,
      })),
    [max, metric, points],
  );
  const path = coordinates.map((coordinate, index) => `${index ? 'L' : 'M'} ${coordinate.x} ${coordinate.y}`).join(' ');
  if (!points.length) return <Text style={styles.empty}>Complete sessions with this exercise to build a progress chart.</Text>;
  return (
    <View accessibilityLabel={`Progress chart with ${points.length} sessions`}>
      <Svg width="100%" height={162} viewBox="0 0 320 162">
        {[24, 58, 92, 126].map((y) => <Line key={y} x1={18} y1={y} x2={302} y2={y} stroke={colors.border} strokeWidth={1} />)}
        {coordinates.length > 1 ? <Path d={path} stroke={colors.primary} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {coordinates.map(({ x, y, point }, index) => (
          <Circle key={point.sessionId} cx={x} cy={y} r={5} fill={colors.primary} stroke={colors.card} strokeWidth={2} />
        ))}
        {coordinates.length ? (
          <SvgText x={coordinates.at(-1)!.x} y={Math.max(12, coordinates.at(-1)!.y - 9)} fill={colors.text} fontSize={10} textAnchor="middle">
            {Math.round(values.at(-1)!).toLocaleString()}
          </SvgText>
        ) : null}
        <SvgText x={18} y={153} fill={colors.textMuted} fontSize={9}>{new Date(points[0]!.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</SvgText>
        <SvgText x={302} y={153} fill={colors.textMuted} fontSize={9} textAnchor="end">{new Date(points.at(-1)!.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingVertical: 26 },
});
