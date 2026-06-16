import { Buffer } from 'node:buffer';
import * as XLSX from 'xlsx';

export function jsonToExcelBuffer<T extends Record<string, unknown>>(
  rows: T[],
  sheetName: string,
  columnWidths?: { wch: number }[],
): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  if (columnWidths) {
    worksheet['!cols'] = columnWidths;
  }

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export function parseExcelBuffer<T extends Record<string, unknown>>(buffer: Buffer): T[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<T>(worksheet);
}
