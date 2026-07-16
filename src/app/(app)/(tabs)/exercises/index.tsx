import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Dumbbell, Edit3, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, Field, LoadingScreen, PageHeader, Screen } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { createExercise, deleteExercise, fetchExercises, updateExercise, type ExerciseListItem } from '@/services/exercises';
import { errorMessage } from '@/services/shared';

export default function ExercisesScreen() {
  const { user } = useAuth();
  const userId = user!.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ExerciseListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const query = useQuery({ queryKey: queryKeys.exercises(userId), queryFn: () => fetchExercises(userId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.all });
  const create = useMutation({
    mutationFn: () => createExercise(userId, name, description),
    onSuccess: async () => { setName(''); setDescription(''); await invalidate(); },
  });
  const update = useMutation({
    mutationFn: () => updateExercise(userId, editing!.id, editName, editDescription),
    onSuccess: async () => { setEditing(null); await invalidate(); },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteExercise(userId, id), onSuccess: invalidate });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? (query.data ?? []).filter((item) => item.name.toLowerCase().includes(needle)) : query.data ?? [];
  }, [query.data, search]);
  const beginEdit = (item: ExerciseListItem) => {
    setEditing(item);
    setEditName(item.name);
    setEditDescription(item.description ?? '');
  };
  const confirmDelete = (item: ExerciseListItem) => Alert.alert(
    'Delete exercise?',
    `${item.name} will also be removed from saved routines. Completed history remains readable where the database relationship allows it.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(item.id) }],
  );

  if (query.isLoading) return <LoadingScreen label="Loading exercises…" />;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} safeBottom={false}>
      <PageHeader title="Exercises" subtitle="Your movement library, notes, history and warm-up settings." icon={<Dumbbell color={colors.primary} size={21} />} />
      {query.error ? <ErrorBanner message={errorMessage(query.error)} /> : null}
      {create.error || update.error || remove.error ? <ErrorBanner message={errorMessage(create.error ?? update.error ?? remove.error)} /> : null}
      <Card style={styles.composer}>
        <Text style={styles.sectionTitle}>New exercise</Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Incline bench press" maxLength={100} />
        <Field label="Notes (optional)" value={description} onChangeText={setDescription} placeholder="Seat height, grip width, form cues" maxLength={2000} />
        <Button title="Add exercise" onPress={() => create.mutate()} loading={create.isPending} disabled={!name.trim()} left={<Plus color={colors.primaryText} size={17} />} />
      </Card>
      <View style={styles.searchWrap}>
        <Search color={colors.textMuted} size={18} style={styles.searchIcon} />
        <Field value={search} onChangeText={setSearch} placeholder="Search by name…" containerStyle={styles.flex} style={styles.searchField} />
        {search ? <Pressable onPress={() => setSearch('')} style={styles.clear}><X color={colors.textMuted} size={17} /></Pressable> : null}
      </View>
      {filtered.length ? (
        <View style={styles.list}>
          {filtered.map((item) => (
            <Card key={item.id} style={styles.exerciseCard}>
              {editing?.id === item.id ? (
                <View style={styles.editForm}>
                  <Field label="Name" value={editName} onChangeText={setEditName} autoFocus />
                  <Field label="Notes" value={editDescription} onChangeText={setEditDescription} />
                  <View style={styles.editActions}>
                    <Button title="Save" compact style={styles.flex} onPress={() => update.mutate()} loading={update.isPending} disabled={!editName.trim()} />
                    <Button title="Cancel" compact style={styles.flex} variant="outline" onPress={() => setEditing(null)} />
                  </View>
                </View>
              ) : (
                <>
                  <Pressable
                    style={styles.exerciseMain}
                    onPress={() => router.push({ pathname: '/(app)/exercise-detail', params: { id: item.id } })}
                  >
                    <View style={styles.exerciseIcon}><Dumbbell color={colors.primary} size={18} /></View>
                    <View style={styles.flex}>
                      <Text style={styles.exerciseName}>{item.name}</Text>
                      {item.description ? <Text style={styles.description} numberOfLines={2}>{item.description}</Text> : null}
                    </View>
                  </Pressable>
                  <View style={styles.rowActions}>
                    <Button title="Edit" compact variant="ghost" onPress={() => beginEdit(item)} left={<Edit3 color={colors.textMuted} size={16} />} />
                    <Button title="" accessibilityLabel={`Delete ${item.name}`} compact variant="ghost" onPress={() => confirmDelete(item)} left={<Trash2 color={colors.destructive} size={17} />} />
                  </View>
                </>
              )}
            </Card>
          ))}
        </View>
      ) : (
        <EmptyState title={search ? 'No matches' : 'No exercises yet'} body={search ? 'Try another exercise name.' : 'Use the form above to add your first movement.'} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  composer: { gap: 14 },
  sectionTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  searchWrap: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 2 },
  searchField: { paddingLeft: 42, paddingRight: 42 },
  clear: { position: 'absolute', right: 8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 9 },
  exerciseCard: { padding: 12, gap: 10 },
  exerciseMain: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  exerciseIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  exerciseName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 15 },
  description: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 3 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  editForm: { gap: 12 },
  editActions: { flexDirection: 'row', gap: 8 },
});
