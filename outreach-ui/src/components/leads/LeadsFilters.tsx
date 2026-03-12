import { useTranslation } from 'react-i18next';
import type { LeadFilters, LeadStatus, LeadLanguage } from '@/types/database';
import { LEAD_STATUS_MAP, LEAD_LANGUAGE_MAP } from '@/lib/constants';
import SearchInput from '@/components/shared/SearchInput';
import { useTeams } from '@/hooks/useLeads';

interface LeadsFiltersProps {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
}

export default function LeadsFilters({ filters, onChange }: LeadsFiltersProps) {
  const { t } = useTranslation();
  const { data: teams } = useTeams();

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 240, flex: 1 }}>
        <SearchInput
          placeholder={t('filters.searchPlaceholder')}
          value={filters.search ?? ''}
          onChange={e => onChange({ ...filters, search: e.target.value || undefined })}
          onClear={() => onChange({ ...filters, search: undefined })}
        />
      </div>

      <select
        className="glass-input"
        value={filters.status ?? ''}
        onChange={e => onChange({ ...filters, status: (e.target.value as LeadStatus) || undefined })}
        style={{ width: 160 }}
      >
        <option value="">{t('filters.allStatuses')}</option>
        {Object.entries(LEAD_STATUS_MAP).map(([val, { label }]) => (
          <option key={val} value={val}>{t(label)}</option>
        ))}
      </select>

      {teams && teams.length > 1 && (
        <select
          className="glass-input"
          value={filters.team_id ?? ''}
          onChange={e => onChange({ ...filters, team_id: e.target.value || undefined })}
          style={{ width: 160 }}
        >
          <option value="">{t('filters.allTeams')}</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      <select
        className="glass-input"
        value={filters.language ?? ''}
        onChange={e => onChange({ ...filters, language: (e.target.value as LeadLanguage) || undefined })}
        style={{ width: 130 }}
      >
        <option value="">Všechny jazyky</option>
        {Object.entries(LEAD_LANGUAGE_MAP).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    </div>
  );
}
