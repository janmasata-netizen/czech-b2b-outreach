import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw, ChevronDown, ChevronRight, Clock, Hash, Building2 } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import SearchInput from '@/components/shared/SearchInput';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import CreateWaveDialog from '@/components/waves/CreateWaveDialog';
import { useRetargetPool, useRetargetLeadHistory } from '@/hooks/useRetargetPool';
import { useTeamsSettings } from '@/hooks/useSettings';
import type { RetargetPoolLead } from '@/types/database';

const PAGE_SIZE = 50;

const LABEL: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 };
const CELL: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px' };
const HEADER: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.04em' };

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function HistoryPanel({ leadId }: { leadId: string }) {
  const { data: history, isLoading } = useRetargetLeadHistory(leadId);

  if (isLoading) return <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>Načítám historii…</div>;
  if (!history || history.length === 0) return <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>Žádná historie</div>;

  return (
    <div style={{ padding: '8px 12px 12px 44px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={LABEL}>Historie vln</div>
      {history.map((wl: any) => (
        <div key={wl.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '6px 10px',
          background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)',
          fontSize: 12,
        }}>
          <span style={{ fontWeight: 500, color: 'var(--text)' }}>{(wl as any).waves?.name ?? '—'}</span>
          <span style={{ color: 'var(--text-muted)' }}>Round {wl.retarget_round ?? 0}</span>
          <span style={{ color: 'var(--text-muted)' }}>Status: {wl.status}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {formatDate(wl.updated_at)}
          </span>
          {(wl as any).sent_emails && (wl as any).sent_emails.length > 0 && (
            <span style={{ color: 'var(--cyan)', fontSize: 11 }}>
              {(wl as any).sent_emails.length} email{(wl as any).sent_emails.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RetargetPoolPage() {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const { data: leads, isLoading } = useRetargetPool(search || undefined, teamFilter || undefined, page, PAGE_SIZE);
  const { data: teams } = useTeamsSettings();

  const selectedLeadIds = useMemo(() => Array.from(selected), [selected]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!leads) return;
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.lead_id)));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Retarget Pool"
        subtitle="Leady po uplynutí lockout periody — připravené k opětovnému oslovení"
        actions={
          selectedLeadIds.length > 0 ? (
            <GlassButton variant="primary" onClick={() => setShowCreate(true)}>
              <RefreshCcw size={13} style={{ marginRight: 6 }} />
              Retarget vlna ({selectedLeadIds.length})
            </GlassButton>
          ) : undefined
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            onClear={() => { setSearch(''); setPage(0); }}
            placeholder="Hledat firmu nebo IČO…"
          />
        </div>
        {teams && teams.length > 1 && (
          <select
            className="glass-input"
            value={teamFilter}
            onChange={e => { setTeamFilter(e.target.value); setPage(0); }}
            style={{ width: 180, fontSize: 12 }}
          >
            <option value="">Všechny týmy</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <GlassCard padding={0}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : !leads || leads.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <RefreshCcw size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              Pool je prázdný
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Leady se objeví po uplynutí lockout periody (výchozí: 120 dní).
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...HEADER, width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === leads.length && leads.length > 0}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ ...HEADER, width: 28 }} />
                  <th style={HEADER}>Firma</th>
                  <th style={HEADER}>IČO</th>
                  <th style={HEADER}>Jednatel(é)</th>
                  <th style={HEADER}>Poslední vlna</th>
                  <th style={HEADER}>Naposledy kontaktován</th>
                  <th style={HEADER}>Počet oslovení</th>
                  <th style={HEADER}>Odemčen od</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: RetargetPoolLead) => (
                  <LeadRow
                    key={lead.lead_id}
                    lead={lead}
                    isSelected={selected.has(lead.lead_id)}
                    isExpanded={expanded === lead.lead_id}
                    onToggleSelect={() => toggleSelect(lead.lead_id)}
                    onToggleExpand={() => setExpanded(prev => prev === lead.lead_id ? null : lead.lead_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {leads && leads.length >= PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
          <GlassButton size="sm" onClick={() => setPage(page - 1)} disabled={page <= 0}>
            Předchozí
          </GlassButton>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', padding: '0 12px', display: 'flex', alignItems: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
            Strana {page + 1}
          </span>
          <GlassButton size="sm" onClick={() => setPage(page + 1)} disabled={leads.length < PAGE_SIZE}>
            Další
          </GlassButton>
        </div>
      )}

      <CreateWaveDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={id => {
          setSelected(new Set());
          navigate(`/vlny/${id}`);
        }}
        preselectedLeadIds={selectedLeadIds}
        retargetMode
      />
    </div>
  );
}

function LeadRow({ lead, isSelected, isExpanded, onToggleSelect, onToggleExpand }: {
  lead: RetargetPoolLead;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  const jednatels = lead.jednatels ?? [];

  return (
    <>
      <tr
        style={{
          borderBottom: '1px solid var(--border)',
          background: isSelected ? 'rgba(62,207,142,0.04)' : 'transparent',
          cursor: 'pointer',
        }}
        onClick={onToggleExpand}
      >
        <td style={{ ...CELL, width: 36 }} onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            style={{ cursor: 'pointer' }}
          />
        </td>
        <td style={{ ...CELL, width: 28, color: 'var(--text-muted)' }}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td style={CELL}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontWeight: 500 }}>{lead.company_name ?? '—'}</span>
          </div>
        </td>
        <td style={{ ...CELL, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{lead.ico ?? '—'}</td>
        <td style={CELL}>
          {jednatels.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          ) : (
            jednatels.map(j => j.full_name).filter(Boolean).join(', ') || '—'
          )}
        </td>
        <td style={CELL}>{lead.last_wave_name ?? '—'}</td>
        <td style={CELL}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={11} style={{ color: 'var(--text-muted)' }} />
            {formatDate(lead.last_contacted_at)}
          </div>
        </td>
        <td style={CELL}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Hash size={11} style={{ color: 'var(--text-muted)' }} />
            {lead.total_waves_count}x
          </div>
        </td>
        <td style={CELL}>
          <span style={{ color: 'var(--green)', fontSize: 12 }}>{formatDate(lead.unlocks_at)}</span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
            <HistoryPanel leadId={lead.lead_id} />
          </td>
        </tr>
      )}
    </>
  );
}
