import { useState } from 'react';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import SearchInput from '@/components/shared/SearchInput';
import { useLeadsNotInWave } from '@/hooks/useLeads';
import { useAddLeadsToWave } from '@/hooks/useWaves';
import { toast } from 'sonner';

interface AddLeadsToWaveDialogProps {
  open: boolean;
  onClose: () => void;
  waveId: string;
  teamId: string | null | undefined;
}

const QUICK_AMOUNTS = [10, 25, 50];

export default function AddLeadsToWaveDialog({ open, onClose, waveId, teamId }: AddLeadsToWaveDialogProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const { data: leads = [], isLoading } = useLeadsNotInWave(teamId ?? undefined, search || undefined);
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
      toast.info('Všechny zobrazené leady jsou již vybrány');
      return;
    }
    setSelected(s => [...s, ...toAdd]);
  }

  async function handleAdd() {
    if (!selected.length) return;
    try {
      await addLeads.mutateAsync({ waveId, leadIds: selected });
      toast.success(`Přidáno ${selected.length} leadů do vlny`);
      setSelected([]);
      onClose();
    } catch {
      toast.error('Chyba při přidávání leadů', { duration: 8000 });
    }
  }

  const allSelected = leads.length > 0 && selected.length === leads.length;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Přidat leady do vlny"
      fullscreen
      footer={
        <>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Vybráno: <strong style={{ color: 'var(--text)' }}>{selected.length}</strong>
            {leads.length > 0 && <span style={{ color: 'var(--text-muted)' }}> / {leads.length}</span>}
          </span>
          <div style={{ flex: 1 }} />
          <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={handleAdd} disabled={!selected.length || addLeads.isPending}>
            {addLeads.isPending ? 'Přidávám…' : `Přidat ${selected.length || ''} leadů`}
          </GlassButton>
        </>
      }
    >
      {/* Search + quick-select row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <SearchInput
            placeholder="Hledat podle názvu nebo IČO…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Přidat:</span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            style={{ accentColor: 'var(--green)', width: 14, height: 14 }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>Firma</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 110, textAlign: 'center' }}>IČO</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 200, textAlign: 'right' }}>Web</span>
        </div>
      )}

      {/* Scrollable list — fills remaining height */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {isLoading && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Načítám…</p>
        )}
        {!isLoading && leads.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>
            {search ? 'Žádné výsledky' : 'Všechny leady jsou již ve vlně nebo žádné nejsou k dispozici.'}
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
                flexShrink: 0,
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
    </GlassModal>
  );
}
