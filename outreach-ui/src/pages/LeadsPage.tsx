import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useLeads } from '@/hooks/useLeads';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LeadFilters } from '@/types/database';
import PageHeader from '@/components/layout/PageHeader';
import LeadsFilters from '@/components/leads/LeadsFilters';
import LeadsTable from '@/components/leads/LeadsTable';
import BulkActions from '@/components/leads/BulkActions';
import AddLeadDialog from '@/components/leads/AddLeadDialog';
import CsvImportDialog from '@/components/leads/CsvImportDialog';
import GoogleSheetImportDialog from '@/components/leads/GoogleSheetImportDialog';
import ImportChooserDialog from '@/components/leads/ImportChooserDialog';
import EmailDiscoveryTab from '@/components/leads/EmailDiscoveryTab';
import ReadyLeadsTab from '@/components/leads/ReadyLeadsTab';
import Pagination from '@/components/shared/Pagination';
import GlassButton from '@/components/glass/GlassButton';
import { PAGE_SIZE } from '@/lib/constants';
import { exportCsv } from '@/lib/export';

type Tab = 'all' | 'discovery' | 'ready' | 'problematic';

function useNeedsReviewCount() {
  return useQuery<number>({
    queryKey: ['leads-needs-review-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'needs_review');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });
}

export default function LeadsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: Tab = (rawTab === 'problematic' || rawTab === 'discovery' || rawTab === 'ready') ? rawTab : 'all';

  const [filters, setFilters] = useState<LeadFilters>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGsheetImport, setShowGsheetImport] = useState(false);
  const [showImportChooser, setShowImportChooser] = useState(false);
  const { data: needsReviewCount = 0 } = useNeedsReviewCount();

  useEffect(() => {
    const action = searchParams.get('action');
    const isNew = searchParams.get('new') === '1';

    if (isNew || action === 'import') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isNew) setShowAdd(true);
      if (action === 'import') setShowImportChooser(true);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        next.delete('action');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const effectiveFilters: LeadFilters = tab === 'problematic'
    ? { status: 'problematic' }
    : filters;

  const { data, isLoading } = useLeads(tab === 'all' || tab === 'problematic' ? effectiveFilters : {}, page);
  const leads = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleFilterChange(f: LeadFilters) {
    setFilters(f);
    setPage(1);
    setSelected([]);
  }

  const PAGE_TITLES: Record<Tab, string> = {
    all:         t('leads.title'),
    discovery:   t('leads.emailDiscovery'),
    ready:       t('leads.readyLeads'),
    problematic: t('leads.problematicLeads'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={PAGE_TITLES[tab]}
        subtitle={tab === 'all' || tab === 'problematic' ? `${total.toLocaleString('cs-CZ')} celkem` : undefined}
        actions={
          (tab === 'all' || tab === 'problematic') ? (
            <GlassButton size="sm" variant="secondary" onClick={async () => {
              const { data } = await supabase
                .from('leads')
                .select('company_name, ico, website, domain, status, created_at, email_candidates(email_address, is_verified)')
                .order('created_at', { ascending: false })
                .limit(5000);
              if (!data?.length) return;
              const rows = data.map((l: { company_name: string | null; ico: string | null; website: string | null; domain: string | null; status: string; created_at: string; email_candidates?: { email_address: string; is_verified: boolean }[] }) => ({
                company_name: l.company_name,
                ico: l.ico,
                website: l.website,
                domain: l.domain,
                status: l.status,
                email: l.email_candidates?.find((c: { is_verified: boolean; email_address: string }) => c.is_verified)?.email_address ?? l.email_candidates?.[0]?.email_address ?? '',
                created_at: l.created_at,
              }));
              exportCsv('leady.csv', ['company_name', 'ico', 'website', 'domain', 'status', 'email', 'created_at'], rows);
            }}>
              Export CSV
            </GlassButton>
          ) : undefined
        }
      />

      {tab === 'problematic' && (
        <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, fontSize: 13, color: '#f87171' }}>
          {t('leads.problematicDesc')}
        </div>
      )}

      {tab === 'all' && needsReviewCount > 0 && (
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', textAlign: 'left',
            padding: '11px 14px',
            background: 'rgba(251,146,60,0.07)',
            border: '1px solid rgba(251,146,60,0.25)',
            borderRadius: 8, cursor: 'pointer',
            color: '#fb923c', fontSize: 13,
          }}
          onClick={() => {
            setFilters({ status: 'needs_review' });
            setPage(1);
            setSelected([]);
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15, background: 'rgba(251,146,60,0.2)', border: '1px solid rgba(251,146,60,0.4)', borderRadius: 20, padding: '1px 9px', lineHeight: 1.6 }}>
            {needsReviewCount}
          </span>
          <span dangerouslySetInnerHTML={{ __html: t('leads.needsReview') }} />
        </button>
      )}

      {tab === 'discovery' && <EmailDiscoveryTab />}

      {tab === 'ready' && <ReadyLeadsTab />}

      {(tab === 'all' || tab === 'problematic') && (
        <>
          {tab === 'all' && (
            <>
              <LeadsFilters filters={filters} onChange={handleFilterChange} />
              {selected.length > 0 && (
                <BulkActions selected={selected} onClear={() => setSelected([])} />
              )}
            </>
          )}

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <LeadsTable leads={leads} isLoading={isLoading} selected={selected} onSelect={setSelected} />
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPage={p => { setPage(p); setSelected([]); }}
            totalItems={total}
            pageSize={PAGE_SIZE}
          />
        </>
      )}

      <AddLeadDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <ImportChooserDialog
        open={showImportChooser}
        onClose={() => setShowImportChooser(false)}
        onChoose={type => {
          if (type === 'csv') setShowImport(true);
          else setShowGsheetImport(true);
        }}
      />
      <CsvImportDialog open={showImport} onClose={() => setShowImport(false)} />
      <GoogleSheetImportDialog open={showGsheetImport} onClose={() => setShowGsheetImport(false)} />
    </div>
  );
}
