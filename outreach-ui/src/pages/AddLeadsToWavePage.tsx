import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWave } from '@/hooks/useWaves';
import { useLeadsNotInWave } from '@/hooks/useLeads';
import { useAddLeadsToWave } from '@/hooks/useWaves';
import Breadcrumb from '@/components/shared/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import SearchInput from '@/components/shared/SearchInput';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import { LEAD_LANGUAGE_MAP } from '@/lib/constants';
import { toast } from 'sonner';

const QUICK_AMOUNTS = [10, 25, 50];

export default function AddLeadsToWavePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading: waveLoading } = useWave(id);

  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const teamId = data?.wave?.team_id;
  const { data: leads = [], isLoading: leadsLoading } = useLeadsNotInWave(
    teamId ?? undefined,
    search || undefined,
    languageFilter || undefined,
  );
  const addLeads = useAddLeadsToWave();

  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  function toggleAll() {
    if (selected.length === leads.length) setSelected([]);
    else setSelected(leads.map(l => l.id));
  }

  function quickSelect(n: number) {
    const already = new Set(selected);
    const toAdd = leads.filter(l => !already.has(l.id)).slice(0, n).map(l => l.id);
    if (toAdd.length === 0) {
      toast.info(t('addLeadsToWave.allAlreadySelected'));
      return;
    }
    setSelected(s => [...s, ...toAdd]);
  }

  async function handleAdd() {
    if (!selected.length || !id) return;
    try {
      await addLeads.mutateAsync({ waveId: id, leadIds: selected });
      toast.success(t('addLeadsToWave.addedCount', { count: selected.length }));
      navigate(`/vlny/${id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Neznámá chyba';
      toast.error(`Chyba při přidávání leadů: ${msg}`, { duration: 8000 });
      console.error('AddLeadsToWave error:', e);
    }
  }

  if (waveLoading) {
    return <LoadingSkeleton />;
  }

  const wave = data?.wave;
  if (!wave) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        {t('addLeadsToWave.waveNotFound', 'Vlna nenalezena')}
      </div>
    );
  }

  const allSelected = leads.length > 0 && selected.length === leads.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Breadcrumb items={[
        { label: t('nav.waves'), to: '/vlny' },
        { label: wave.name ?? t('nav.waves'), to: `/vlny/${id}` },
        { label: t('addLeadsToWave.title') },
      ]} />

      <PageHeader
        title={t('addLeadsToWave.title')}
        subtitle={wave.name}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t('addLeadsToWave.selectedCount')} <strong style={{ color: 'var(--text)' }}>{selected.length}</strong>
              {leads.length > 0 && <span style={{ color: 'var(--text-muted)' }}> / {leads.length}</span>}
            </span>
            <GlassButton variant="secondary" onClick={() => navigate(`/vlny/${id}`)}>
              {t('common.cancel')}
            </GlassButton>
            <GlassButton variant="primary" onClick={handleAdd} disabled={!selected.length || addLeads.isPending}>
              {addLeads.isPending ? t('addLeadsToWave.adding') : t('addLeadsToWave.addCount', { count: selected.length })}
            </GlassButton>
          </div>
        }
      />

      <GlassCard padding={20}>
        {/* Search + language filter + quick-select row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <SearchInput
              placeholder={t('addLeadsToWave.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <select
            className="glass-input"
            style={{ width: 120, height: 34, fontSize: 12, flexShrink: 0 }}
            value={languageFilter}
            onChange={e => setLanguageFilter(e.target.value)}
          >
            <option value="">{t('addLeadsToWave.allLanguages')}</option>
            {Object.entries(LEAD_LANGUAGE_MAP).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{t('addLeadsToWave.addQuick')}</span>
            {QUICK_AMOUNTS.map(n => (
              <button
                key={n}
                onClick={() => quickSelect(n)}
                style={{
                  padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  color: 'var(--text-dim)', transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget;
                  el.style.background = 'rgba(62,207,142,0.1)';
                  el.style.borderColor = 'rgba(62,207,142,0.35)';
                  el.style.color = 'var(--green)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget;
                  el.style.background = 'var(--bg-surface)';
                  el.style.borderColor = 'var(--border)';
                  el.style.color = 'var(--text-dim)';
                }}
              >
                +{n}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        {leads.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: 'var(--green)', width: 14, height: 14 }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>{t('addLeadsToWave.columnCompany')}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 60, textAlign: 'center' }}>{t('addLeadsToWave.columnLanguage')}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 110, textAlign: 'center' }}>{t('addLeadsToWave.columnIco')}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 200, textAlign: 'right' }}>{t('addLeadsToWave.columnWeb')}</span>
          </div>
        )}

        {/* Lead list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {leadsLoading && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>{t('addLeadsToWave.loadingLeads')}</p>
          )}
          {!leadsLoading && leads.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>
              {search ? t('addLeadsToWave.noResults') : t('addLeadsToWave.allLeadsInWave')}
            </p>
          )}
          {leads.map(lead => {
            const sel = selected.includes(lead.id);
            return (
              <div
                key={lead.id}
                onClick={() => toggle(lead.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                  background: sel ? 'rgba(62,207,142,0.08)' : 'var(--bg-subtle)',
                  border: `1px solid ${sel ? 'rgba(62,207,142,0.3)' : 'var(--border)'}`,
                  transition: 'all 0.12s',
                }}
              >
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggle(lead.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ accentColor: 'var(--green)', width: 14, height: 14, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.company_name ?? '—'}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', width: 110, textAlign: 'center', flexShrink: 0 }}>
                  {lead.ico ?? '—'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 200, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.website ?? ''}
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
