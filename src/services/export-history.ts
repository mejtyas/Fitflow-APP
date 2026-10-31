import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { getDatabase } from '@/lib/db';
import { displayName } from '@/lib/format';
import { isLoggedSetReps } from '@/lib/validation';
import { LixoError } from '@/services/shared';

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

async function loadRows(): Promise<ExportRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    started_at: string;
    ended_at: string;
    workout_name: string | null;
    exercise_name: string | null;
    logged_order: number | null;
    first_logged_at: string | null;
    set_index: number;
    kg: number | null;
    reps: number | null;
  }>(
    `SELECT ws.started_at, ws.ended_at, w.name AS workout_name, e.name AS exercise_name,
            se.logged_order, se.first_logged_at, ss.set_index, ss.kg, ss.reps
       FROM workout_sessions ws
       LEFT JOIN workouts w ON w.id = ws.workout_id
       JOIN session_exercises se ON se.workout_session_id = ws.id
       LEFT JOIN exercises e ON e.id = se.exercise_id
       JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.ended_at IS NOT NULL
      ORDER BY ws.started_at DESC, ws.id, se.order_index, ss.set_index`,
    [],
  );
  return rows.flatMap((row) => {
    if (!isLoggedSetReps(row.reps)) return [];
    const startedAt = new Date(row.started_at).getTime();
    return [{
      date: new Date(row.started_at).toLocaleDateString(),
      workout_name: displayName(row.workout_name, 'Unnamed Session'),
      duration_minutes: Number(((new Date(row.ended_at).getTime() - startedAt) / 60_000).toFixed(1)),
      exercise_name: displayName(row.exercise_name, '?'),
      exercise_logged_order: row.logged_order ?? '',
      exercise_first_logged_at: row.first_logged_at ?? '',
      set_index: row.set_index + 1,
      kg: row.kg ?? '',
      reps: row.reps,
    }];
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
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lixo history" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(worksheet),
  };
  return zipSync(files, { level: 6 });
}

export async function exportHistory(format: 'csv' | 'xlsx') {
  if (!(await Sharing.isAvailableAsync())) throw new LixoError('File sharing is not available on this device.');
  const rows = await loadRows();
  const name = `lixo-history.${format}`;
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  if (format === 'csv') file.write(createCsv(rows));
  else file.write(createXlsx(rows));
  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export Lixo history as ${format.toUpperCase()}`,
    UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'org.openxmlformats.spreadsheetml.sheet',
  });
}
