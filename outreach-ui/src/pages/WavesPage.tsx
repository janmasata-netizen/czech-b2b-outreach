import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWaves } from '@/hooks/useWaves';
import PageHeader from '@/components/layout/PageHeader';
import WavesTable from '@/components/waves/WavesTable';
import CreateWaveDialog from '@/components/waves/CreateWaveDialog';

type Tab = 'manager' | 'live' | 'archive';

const TABS: { id: Tab; statuses: string[]; title: string; emptyTitle: string; emptyDesc: string }[] = [
  {
    id: 'manager',
    statuses: ['draft'],
    title: 'Manager',
    emptyTitle: 'Žádné koncepty',
    emptyDesc: 'Vytvořte první vlnu pomocí tlačítka níže v postranním panelu.',
  },
  {
    id: 'live',
    statuses: ['scheduled', 'sending'],
    title: 'Live',
    emptyTitle: 'Žádné aktivní vlny',
    emptyDesc: 'Naplánované a odesílané vlny se zobrazí zde.',
  },
  {
    id: 'archive',
    statuses: ['done', 'completed', 'paused'],
    title: 'Archiv',
    emptyTitle: 'Archiv je prázdný',
    emptyDesc: 'Dokončené vlny se zobrazí zde.',
  },
];

export default function WavesPage() {
  const { data: waves, isLoading } = useWaves();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const tabId = (searchParams.get('tab') ?? 'manager') as Tab;
  const tab = TABS.find(t => t.id === tabId) ?? TABS[0];
  const filtered = (waves ?? []).filter(w => tab.statuses.includes(w.status));

  // SubPanel "Nová vlna" button navigates to ?new=1 — detect and open dialog
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowCreate(true);
      // Remove the ?new=1 param immediately so back-nav doesn't re-open it
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      }, { replace: true });
    }
  }, [searchParams]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={tab.title}
        subtitle={`${filtered.length} vln`}
      />

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {filtered.length === 0 && !isLoading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--text-muted)' }}>⌁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{tab.emptyTitle}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tab.emptyDesc}</div>
          </div>
        ) : (
          <WavesTable waves={filtered} isLoading={isLoading} />
        )}
      </div>

      <CreateWaveDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={id => navigate(`/vlny/${id}`)}
      />
    </div>
  );
}
