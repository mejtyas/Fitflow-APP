import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { supabase } from '@/lib/supabase';
import { isLoggedSetReps } from '@/lib/validation';
import { workoutNameFromRelation } from '@/lib/format';
import { FitFlowError, throwOnError } from '@/services/shared';

export type ExportRow = {
  date: string;
  workout_name: string;
  duration_minutes: number;
  exercise_name: string;
  exercise_logged_order: number | '';
  exercise_first_logged_at: string;
  set_index: number;
  kg: number | '';
  reps: number | '';
};

const headers: (keyof ExportRow)[] = [
  'date',
  'workout_name',
  'duration_minutes',
  'exercise_name',
  'exercise_logged_order',
  'exercise_first_logged_at',
  'set_index',
  'kg',
  'reps',
];

async function loadRows(userId: string): Promise<ExportRow[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(`id, started_at, ended_at, workouts(name), session_exercises(order_index, logged_order, first_logged_at, exercises(name), session_sets(set_index, kg, reps))`)
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });
  throwOnError(error);
  return (data ?? []).flatMap((session) => {
    const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : new Date(session.started_at).getTime();
    const duration = Number(((endedAt - new Date(session.started_at).getTime()) / 60_000).toFixed(1));
    return [...(session.session_exercises ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .flatMap((exercise) =>
        [...(exercise.session_sets ?? [])]
          .filter((set) => isLoggedSetReps(set.reps))
          .sort((a, b) => a.set_index - b.set_index)
          .map((set) => ({
            date: new Date(session.started_at).toLocaleDateString(),
            workout_name: workoutNameFromRelation(session.workouts, 'Unnamed Session'),
            duration_minutes: duration,
            exercise_name: workoutNameFromRelation(exercise.exercises, '?'),
            exercise_logged_order: exercise.logged_order ?? '',
            exercise_first_logged_at: exercise.first_logged_at ?? '',
            set_index: set.set_index + 1,
            kg: set.kg ?? '',
            reps: set.reps ?? '',
          })),
      );
  });
}

function csvCell(value: string | number) {
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function createCsv(rows: ExportRow[]) {
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\r\n');
}

function xml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number) {
  let result = '';
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function inlineCell(reference: string, value: string | number) {
  if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
  return `<c r="${reference}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
}

export function createXlsx(rows: ExportRow[]) {
  const allRows: (string | number)[][] = [headers, ...rows.map((row) => headers.map((header) => row[header]))];
  const sheetRows = allRows
    .map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => inlineCell(`${columnName(columnIndex)}${rowIndex + 1}`, value)).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:I${Math.max(1, allRows.length)}"/></worksheet>`;
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FitFlow history" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(worksheet),
  };
  return zipSync(files, { level: 6 });
}

export async function exportHistory(userId: string, format: 'csv' | 'xlsx') {
  if (!(await Sharing.isAvailableAsync())) throw new FitFlowError('File sharing is not available on this device.');
  const rows = await loadRows(userId);
  const name = `fitflow-history.${format}`;
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  if (format === 'csv') file.write(createCsv(rows));
  else file.write(createXlsx(rows));
  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export FitFlow history as ${format.toUpperCase()}`,
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'org.openxmlformats.spreadsheetml.sheet',
  });
}
