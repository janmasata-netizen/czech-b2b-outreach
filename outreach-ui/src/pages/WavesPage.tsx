import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWaves } from '@/hooks/useWaves';
import PageHeader from '@/components/layout/PageHeader';
import WavesTable from '@/components/waves/WavesTable';
import CreateWaveDialog from '@/components/waves/CreateWaveDialog';

type Tab = 'manager' | 'live' | 'archive';

type TabDef = { id: Tab; statuses: string[]; titleKey: string; emptyTitleKey: string; emptyDescKey: string };

const TABS: TabDef[] = [
  {
    id: 'manager',
    statuses: ['draft', 'verifying', 'verified'],
    titleKey: 'sub.manager',
    emptyTitleKey: 'waves.noDrafts',
    emptyDescKey: 'waves.noDraftsDesc',
  },
  {
    id: 'live',
    statuses: ['scheduled', 'sending'],
    titleKey: 'sub.live',
    emptyTitleKey: 'waves.noActiveWaves',
    emptyDescKey: 'waves.noActiveWavesDesc',
  },
  {
    id: 'archive',
    statuses: ['done', 'completed', 'paused'],
    titleKey: 'sub.archive',
    emptyTitleKey: 'waves.emptyArchive',
    emptyDescKey: 'waves.emptyArchiveDesc',
  },
];

export default function WavesPage() {
  const { t } = useTranslation();
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCreate(true);
      // Remove the ?new=1 param immediately so back-nav doesn't re-open it
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title={t(tab.titleKey)}
        subtitle={t('waves.wavesCount', { count: filtered.length })}
      />

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {filtered.length === 0 && !isLoading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: 'var(--text-muted)' }}>⌁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t(tab.emptyTitleKey)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t(tab.emptyDescKey)}</div>
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
