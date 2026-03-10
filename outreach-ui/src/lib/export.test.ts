import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportCsv } from './export';

describe('exportCsv', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('creates and clicks a download link', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    exportCsv('test.csv', ['name', 'email'], [
      { name: 'Jan', email: 'jan@test.cz' },
    ]);

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('handles empty rows', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    exportCsv('test.csv', ['name'], []);
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('handles null values', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    exportCsv('test.csv', ['name'], [{ name: null }]);
    expect(clickSpy).toHaveBeenCalledOnce();
  });
});
