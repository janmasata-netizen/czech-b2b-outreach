import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/glass/GlassCard';
import StatusBadge from '@/components/shared/StatusBadge';

interface WaveLead {
  id: string;
  wave_id: string;
  ab_variant: string;
  status: string;
  waves: { name: string; status: string };
}

interface CampaignHistoryProps {
  waveLeads: WaveLead[];
}

export default function CampaignHistory({ waveLeads }: CampaignHistoryProps) {
  const navigate = useNavigate();

  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Historie kampaní</h3>
      {!waveLeads.length ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Lead nebyl zahrnut do žádné vlny</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {waveLeads.map(wl => (
            <div
              key={wl.id}
              onClick={() => navigate(`/vlny/${wl.wave_id}`)}
              style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{wl.waves.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Varianta <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)' }}>{wl.ab_variant}</span>
                </div>
              </div>
              <StatusBadge status={wl.status} />
              <StatusBadge status={wl.waves.status} type="wave" />
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
