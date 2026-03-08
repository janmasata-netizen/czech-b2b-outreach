function escapeCsvValue(val: unknown): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function exportCsv(filename: string, headers: string[], rows: Record<string, unknown>[]) {
  const keys = headers;
  const csvLines = [
    keys.map(escapeCsvValue).join(','),
    ...rows.map(row => keys.map(k => escapeCsvValue(row[k])).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
