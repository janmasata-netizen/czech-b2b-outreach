import { useCompanyRelevantTags } from '@/hooks/useTags';
import { useTeams } from '@/hooks/useLeads';
import type { CompanyFilters, MasterStatus } from '@/types/database';

interface DatabaseFiltersProps {
  filters: CompanyFilters;
  onChange: (filters: CompanyFilters) => void;
}

const STATUS_OPTIONS: { value: MasterStatus | ''; label: string }[] = [
  { value: '',            label: 'Všechny' },
  { value: 'active',      label: 'Aktivní' },
  { value: 'blacklisted', label: 'Blacklist' },
  { value: 'archived',    label: 'Archivováno' },
];

export default function DatabaseFilters({ filters, onChange }: DatabaseFiltersProps) {
  const { data: tags = [] } = useCompanyRelevantTags(filters.team_id);
  const { data: teams = [] } = useTeams();
  const selectedTagIds = filters.tag_ids ?? [];

  function toggleTag(tagId: string) {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    onChange({ ...filters, tag_ids: next.length ? next : undefined });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Row 1: Search + Status + Team */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="glass-input"
          placeholder="Hledat firmu nebo IČO…"
          value={filters.search ?? ''}
          onChange={e => onChange({ ...filters, search: e.target.value || undefined })}
          style={{ minWidth: 240, flex: 1, padding: '7px 12px', fontSize: 13 }}
        />
        <select
          className="glass-input"
          value={filters.master_status ?? ''}
          onChange={e => onChange({ ...filters, master_status: (e.target.value || undefined) as MasterStatus | undefined })}
          style={{ width: 160, padding: '7px 12px', fontSize: 13 }}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {teams.length >= 2 && (
          <select
            className="glass-input"
            value={filters.team_id ?? ''}
            onChange={e => onChange({ ...filters, team_id: e.target.value || undefined })}
            style={{ width: 160, padding: '7px 12px', fontSize: 13 }}
          >
            <option value="">Všechny týmy</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Row 2: Tag filter pills */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Štítky:</span>
          {tags.map(tag => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                style={{
                  background: active ? `${tag.color}33` : 'transparent',
                  border: `1px solid ${active ? tag.color : 'var(--border)'}`,
                  borderRadius: 10, padding: '2px 10px', cursor: 'pointer',
                  fontSize: 11, color: active ? tag.color : 'var(--text-dim)',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
