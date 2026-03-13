import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useCompanies } from '@/hooks/useCompanies';
import type { CompanyFilters, MasterStatus } from '@/types/database';
import PageHeader from '@/components/layout/PageHeader';
import TagManager from '@/components/database/TagManager';
import DatabaseFilters from '@/components/database/DatabaseFilters';
import DatabaseTable from '@/components/database/DatabaseTable';
import DatabaseBulkActions from '@/components/database/DatabaseBulkActions';
import Pagination from '@/components/shared/Pagination';
import AddLeadDialog from '@/components/leads/AddLeadDialog';
import GlassButton from '@/components/glass/GlassButton';
import { PAGE_SIZE } from '@/lib/constants';
import { exportCsv } from '@/lib/export';
import { supabase } from '@/lib/supabase';

export default function DatabasePage() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  // Derive filters from URL params
  const filters: CompanyFilters = {
    search: sp.get('q') || undefined,
    master_status: (sp.get('status') as MasterStatus) || undefined,
    team_id: sp.get('team') || undefined,
  };

  // Check for tab-based status from SubPanel
  const tab = sp.get('tab');
  useEffect(() => {
    if (tab === 'active' && !sp.get('status')) setSp(p => { p.set('status', 'active'); return p; }, { replace: true });
    if (tab === 'blacklist' && !sp.get('status')) setSp(p => { p.set('status', 'blacklisted'); return p; }, { replace: true });
    if (tab === 'archived' && !sp.get('status')) setSp(p => { p.set('status', 'archived'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Open add dialog from SubPanel action
  useEffect(() => {
    if (sp.get('new') === '1') {
      setShowAdd(true);
      setSp(p => { p.delete('new'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const { data, isLoading } = useCompanies(filters, page);
  const companies = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function handleFilterChange(next: CompanyFilters) {
    setPage(1);
    setSelected([]);
    const p = new URLSearchParams();
    if (next.search) p.set('q', next.search);
    if (next.master_status) p.set('status', next.master_status);
    if (next.team_id) p.set('team', next.team_id);
    setSp(p, { replace: true });
  }

  function toggleSelect(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleAll() {
    setSelected(s => s.length === companies.length ? [] : companies.map(c => c.id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={t('database.title')}
        subtitle={t('database.companiesCount', { count: totalCount })}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <GlassButton size="sm" variant="secondary" onClick={async () => {
              const { data } = await supabase
                .from('companies')
                .select('company_name, ico, website, domain, master_status, created_at')
                .order('created_at', { ascending: false })
                .limit(5000);
              if (!data?.length) return;
              exportCsv('databaze.csv', ['company_name', 'ico', 'website', 'domain', 'master_status', 'created_at'], data);
            }}>
              Export CSV
            </GlassButton>
            <GlassButton variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              {t('database.addCompany')}
            </GlassButton>
          </div>
        }
      />

      <TagManager teamId={filters.team_id} />

      <DatabaseFilters filters={filters} onChange={handleFilterChange} />

      <DatabaseBulkActions selected={selected} onClear={() => setSelected([])} teamId={filters.team_id} />

      <DatabaseTable
        companies={companies}
        selected={selected}
        onToggle={toggleSelect}
        onToggleAll={toggleAll}
        isLoading={isLoading}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        onPage={setPage}
        totalItems={totalCount}
        pageSize={PAGE_SIZE}
      />

      <AddLeadDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
