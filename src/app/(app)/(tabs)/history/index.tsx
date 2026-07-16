import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Download, History, Trash2, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, LoadingScreen, PageHeader, Screen, StatTile } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDate, formatDurationMs } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { exportHistory } from '@/services/export-history';
import { clearCompletedHistory, deleteHistorySession, fetchHistoryPage } from '@/services/history';
import { errorMessage } from '@/services/shared';

export default function HistoryScreen() {
  const { user } = useAuth();
  const userId = user!.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: queryKeys.history(userId, page), queryFn: () => fetchHistoryPage(userId, page) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.all });
  const remove = useMutation({ mutationFn: (id: string) => deleteHistorySession(userId, id), onSuccess: invalidate });
  const clear = useMutation({ mutationFn: () => clearCompletedHistory(userId), onSuccess: async () => { setPage(1); await invalidate(); } });
  const share = useMutation({ mutationFn: (format: 'csv' | 'xlsx') => exportHistory(userId, format) });

  const confirmClear = () => Alert.alert('Clear completed history?', 'All completed sessions and their sets will be permanently deleted.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete all', style: 'destructive', onPress: () => clear.mutate() },
  ]);
  const confirmDelete = (id: string) => Alert.alert('Delete this session?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(id) },
  ]);

  if (query.isLoading) return <LoadingScreen label="Loading history…" />;
  const data = query.data;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} safeBottom={false}>
      <PageHeader title="History" subtitle="Completed sessions, newest first." icon={<History color={colors.primary} size={21} />} />
      {query.error || remove.error || clear.error || share.error ? <ErrorBanner message={errorMessage(query.error ?? remove.error ?? clear.error ?? share.error)} /> : null}
      {data?.totalSessions ? (
        <>
          <View style={styles.toolbar}>
            <Button title="CSV" compact variant="outline" loading={share.isPending && share.variables === 'csv'} onPress={() => share.mutate('csv')} left={<Download color={colors.text} size={15} />} />
            <Button title="XLSX" compact variant="outline" loading={share.isPending && share.variables === 'xlsx'} onPress={() => share.mutate('xlsx')} left={<Download color={colors.text} size={15} />} />
            <Button title="Clear" compact variant="ghost" loading={clear.isPending} onPress={confirmClear} left={<Trash2 color={colors.destructive} size={15} />} />
          </View>
          <View style={styles.stats}>
            <StatTile label="Sessions" value={data.totalSessions} icon={<Trophy color={colors.primary} size={17} />} />
            <StatTile label="Total time" value={formatDurationMs(data.totalMinutes * 60_000)} icon={<Clock color={colors.primary} size={17} />} />
            <StatTile label="Average" value={formatDurationMs(data.averageMinutes * 60_000)} icon={<CalendarDays color={colors.primary} size={17} />} />
          </View>
        </>
      ) : null}
      {data?.items.length ? (
        <View style={styles.list}>
          {data.items.map((session) => (
            <Card key={session.id} style={styles.sessionCard}>
              <Pressable
                style={styles.sessionMain}
                onPress={() => router.push({ pathname: '/(app)/history-detail', params: { id: session.id } })}
              >
                <View style={styles.sessionIcon}><History color={colors.primary} size={18} /></View>
                <View style={styles.flex}>
                  <Text style={styles.sessionName}>{session.workoutName}</Text>
                  <Text style={styles.sessionMeta}>{formatDate(session.startedAt)} · {session.duration}</Text>
                </View>
                <ChevronRight color={colors.textMuted} size={20} />
              </Pressable>
              <Pressable accessibilityLabel={`Delete ${session.workoutName}`} onPress={() => confirmDelete(session.id)} style={styles.deleteButton}>
                <Trash2 color={colors.destructive} size={16} />
              </Pressable>
            </Card>
          ))}
          {data.totalPages > 1 ? (
            <View style={styles.pagination}>
              <Button title="Previous" compact variant="outline" disabled={page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))} left={<ChevronLeft color={colors.text} size={16} />} />
              <Text style={styles.pageText}>{page} / {data.totalPages}</Text>
              <Button title="Next" compact variant="outline" disabled={page >= data.totalPages} onPress={() => setPage((current) => current + 1)} right={<ChevronRight color={colors.text} size={16} />} />
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState title="No history yet" body="Finish a workout and it will appear here with sets, duration and rest segments." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  stats: { flexDirection: 'row', gap: 8 },
  list: { gap: 9 },
  sessionCard: { padding: 0, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  sessionMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sessionIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  sessionName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 15 },
  sessionMeta: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 11, marginTop: 4 },
  deleteButton: { width: 48, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 },
  pageText: { color: colors.textMuted, fontFamily: fonts.monoMedium, fontSize: 11 },
});
