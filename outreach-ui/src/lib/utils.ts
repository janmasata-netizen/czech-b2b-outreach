import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { cs } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ================================================================
// DATE FORMATTING
// ================================================================
export function formatDate(dateStr: string | null | undefined, fmt = 'd. M. yyyy'): string {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '—';
    return format(d, fmt, { locale: cs });
  } catch {
    return '—';
  }
}

export function formatDatetime(dateStr: string | null | undefined): string {
  return formatDate(dateStr, 'd. M. yyyy HH:mm');
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '—';
    return formatDistanceToNow(d, { addSuffix: true, locale: cs });
  } catch {
    return '—';
  }
}

// ================================================================
// NUMBER FORMATTING
// ================================================================
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return new Intl.NumberFormat('cs-CZ').format(n);
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '0 %';
  return `${Number(n).toFixed(decimals)} %`;
}

// ================================================================
// DOMAIN EXTRACTION
// ================================================================
export function extractDomain(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ================================================================
// TRUNCATE
// ================================================================
export function truncate(str: string | null | undefined, maxLen = 40): string {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

// ================================================================
// LEAD NAME (full from jednatels)
// ================================================================
export function getJednatelsDisplay(
  jednatels: Array<{ full_name: string | null }> | undefined
): string {
  if (!jednatels?.length) return '—';
  return jednatels.map(j => j.full_name).filter(Boolean).join(', ') || '—';
}

// ================================================================
// DEBOUNCE
// ================================================================
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// ================================================================
// COLOR FOR PROGRESS
// ================================================================
export function progressColor(pct: number): string {
  if (pct >= 80) return 'var(--red)';
  if (pct >= 50) return 'var(--orange)';
  return 'var(--green)';
}
