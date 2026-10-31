import { strFromU8, unzipSync } from 'fflate';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' } }));
jest.mock('expo-sharing', () => ({}));

import { createCsv, createXlsx, type ExportRow } from '@/services/export-history';

const row: ExportRow = {
  date: '2026-07-17',
  workout_name: 'Legs, "heavy"',
  duration_minutes: 51.5,
  exercise_name: 'Squat & press',
  exercise_logged_order: 1,
  exercise_first_logged_at: '2026-07-17T08:00:00.000Z',
  set_index: 2,
  kg: 120,
  reps: 5,
};

describe('history export formats', () => {
  test('escapes CSV cells without changing numeric values', () => {
    const csv = createCsv([row]);
    expect(csv).toContain('date,workout_name,duration_minutes');
    expect(csv).toContain('"Legs, ""heavy"""');
    expect(csv).toContain(',51.5,');
  });

  test('creates a valid XLSX package with escaped worksheet data', () => {
    const files = unzipSync(createXlsx([row]));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/worksheets/sheet1.xml',
      ]),
    );
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain('Legs, &quot;heavy&quot;');
    expect(sheet).toContain('Squat &amp; press');
    expect(sheet).toContain('<v>120</v>');
  });
});
