import { useTranslation } from 'react-i18next';
import GlassButton from '@/components/glass/GlassButton';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  totalItems?: number;
  pageSize?: number;
}

export default function Pagination({ page, totalPages, onPage, totalItems, pageSize }: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  const from = pageSize ? (page - 1) * pageSize + 1 : null;
  const to = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
      {totalItems != null && from != null && to != null ? (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {from}–{to} {t('common.of')} {totalItems}
        </span>
      ) : <span />}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <GlassButton size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>{t('pagination.previous')}</GlassButton>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', padding: '0 8px', fontFamily: 'JetBrains Mono, monospace' }}>
          {page} / {totalPages}
        </span>
        <GlassButton size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>{t('pagination.next')}</GlassButton>
      </div>
    </div>
  );
}
