import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Circle, MessageSquareText, Send } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, Field, LoadingScreen, PageHeader, Screen } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { limits } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';
import { createFeedback, fetchFeedback, setFeedbackSolved } from '@/services/feedback';
import { errorMessage } from '@/services/shared';

type Filter = 'open' | 'solved' | 'all';

export default function FeedbackScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const query = useQuery({ queryKey: queryKeys.feedback(), queryFn: fetchFeedback });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.feedback() });
  const create = useMutation({
    mutationFn: () => createFeedback(user!.id, user?.email, body),
    onSuccess: async () => { setBody(''); await refresh(); },
  });
  const toggle = useMutation({ mutationFn: ({ id, solved }: { id: string; solved: boolean }) => setFeedbackSolved(id, solved), onSuccess: refresh });
  const items = useMemo(() => {
    const all = query.data ?? [];
    return filter === 'all' ? all : all.filter((item) => filter === 'solved' ? item.solved : !item.solved);
  }, [filter, query.data]);
  const counts = { open: (query.data ?? []).filter((item) => !item.solved).length, solved: (query.data ?? []).filter((item) => item.solved).length, all: query.data?.length ?? 0 };
  if (query.isLoading) return <LoadingScreen label="Loading feedback…" />;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Button title="More" compact variant="ghost" style={styles.back} onPress={() => router.back()} left={<ArrowLeft color={colors.textMuted} size={18} />} />
      <PageHeader title="Feedback" subtitle="Share bugs and ideas. All signed-in collaborators can track and solve notes." icon={<MessageSquareText color={colors.primary} size={21} />} />
      {query.error || create.error || toggle.error ? <ErrorBanner message={errorMessage(query.error ?? create.error ?? toggle.error)} /> : null}
      <Card style={styles.cardGap}>
        <Text style={styles.title}>New note</Text>
        <Field label={`Message · ${body.length.toLocaleString()} / ${limits.feedback.toLocaleString()}`} multiline value={body} onChangeText={setBody} maxLength={limits.feedback} placeholder="Describe a bug, steps, or an improvement idea…" />
        <Button title="Send" disabled={!body.trim()} loading={create.isPending} onPress={() => create.mutate()} left={<Send color={colors.primaryText} size={16} />} />
      </Card>
      <View style={styles.filters}>
        {(['open', 'solved', 'all'] as Filter[]).map((value) => (
          <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value} · {counts[value]}</Text>
          </Pressable>
        ))}
      </View>
      {items.length ? (
        <View style={styles.cardGap}>
          {items.map((item) => (
            <Card key={item.id} style={[styles.note, item.solved && styles.noteSolved]}>
              <View style={styles.noteTop}>
                {item.solved ? <CheckCircle2 color={colors.success} size={18} /> : <Circle color={colors.warning} size={18} />}
                <View style={styles.flex}>
                  <Text style={styles.author}>{item.authorEmail}</Text>
                  <Text style={styles.date}>{formatDate(item.createdAt, true)}</Text>
                </View>
                <Text style={[styles.status, { color: item.solved ? colors.success : colors.warning }]}>{item.solved ? 'SOLVED' : 'OPEN'}</Text>
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <Button title={item.solved ? 'Mark open' : 'Mark solved'} compact variant={item.solved ? 'outline' : 'secondary'} loading={toggle.isPending && toggle.variables?.id === item.id} onPress={() => toggle.mutate({ id: item.id, solved: !item.solved })} />
            </Card>
          ))}
        </View>
      ) : <EmptyState title={`No ${filter} notes`} body="Change the filter or add a new note." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', marginLeft: -10 },
  cardGap: { gap: 13 },
  title: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  filters: { flexDirection: 'row', padding: 3, borderRadius: radius.md, backgroundColor: colors.surface },
  filter: { flex: 1, minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  filterActive: { backgroundColor: colors.primaryMuted },
  filterText: { color: colors.textMuted, fontFamily: fonts.monoMedium, fontSize: 9, textTransform: 'uppercase' },
  filterTextActive: { color: colors.primary },
  note: { gap: 12 },
  noteSolved: { opacity: 0.72 },
  noteTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  author: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 13 },
  date: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 10, marginTop: 2 },
  status: { fontFamily: fonts.monoSemibold, fontSize: 8, letterSpacing: 0.8 },
  body: { color: colors.text, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
});
