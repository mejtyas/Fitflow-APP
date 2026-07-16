import { supabase } from '@/lib/supabase';
import { limits } from '@/lib/validation';
import { FitFlowError, throwOnError } from '@/services/shared';

export type FeedbackItem = {
  id: string;
  authorEmail: string;
  body: string;
  solved: boolean;
  createdAt: string;
};

export async function fetchFeedback(): Promise<FeedbackItem[]> {
  const { data, error } = await supabase
    .from('app_feedback')
    .select('id, author_email, body, solved, created_at')
    .order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    authorEmail: row.author_email,
    body: row.body,
    solved: row.solved,
    createdAt: row.created_at,
  }));
}

export async function createFeedback(userId: string, email: string | undefined, bodyRaw: string) {
  const body = bodyRaw.trim();
  if (!body) throw new FitFlowError('Please enter feedback.');
  if (body.length > limits.feedback) throw new FitFlowError('Message is too long (max 4,000 characters).');
  const { error } = await supabase.from('app_feedback').insert({
    user_id: userId,
    author_email: email ?? 'unknown',
    body,
  });
  throwOnError(error);
}

export async function setFeedbackSolved(id: string, solved: boolean) {
  const { error } = await supabase
    .from('app_feedback')
    .update({ solved, solved_at: solved ? new Date().toISOString() : null })
    .eq('id', id);
  throwOnError(error);
}
