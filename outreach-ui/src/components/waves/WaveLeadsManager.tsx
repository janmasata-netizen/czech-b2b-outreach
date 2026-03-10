import { Fragment, useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import EmptyState from '@/components/shared/EmptyState';
import AddLeadsToWaveDialog from './AddLeadsToWaveDialog';
import EmailSequenceCards from './EmailSequenceCards';
import EmailEditModal from './EmailEditModal';
import { useRemoveLeadFromWave } from '@/hooks/useLeads';
import { toast } from 'sonner';
import type { EmailTemplate, EmailQueue, TemplateVariable, WaveLeadRow, Jednatel, EmailCandidate } from '@/types/database';
import { WAVE_LEAD_STATUS_MAP, STATUS_COLOR_MAP } from '@/lib/constants';

const EMAIL_STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  valid:         { bg: 'rgba(62,207,142,0.1)',  border: 'rgba(62,207,142,0.25)',  text: '#3ECF8E' },
  likely_valid:  { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',  text: '#fbbf24' },
  bounced:       { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', text: '#f87171' },
  invalid:       { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', text: '#f87171' },
  info_email:    { bg: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.25)',  text: '#22d3ee' },
};

function EmailStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const c = EMAIL_STATUS_COLORS[status] ?? { bg: 'rgba(82,82,91,0.15)', border: 'rgba(82,82,91,0.3)', text: '#71717a' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    }}>
      {status}
    </span>
  );
}

function hasUsableEmail(wl: WaveLeadRow): boolean {
  const jednatels = wl.leads?.jednatels ?? [];
  const allCandidates = jednatels.flatMap((j: Jednatel & { email_candidates?: EmailCandidate[] }) => j.email_candidates ?? []);
  return allCandidates.some(
    (ec: EmailCandidate) => ec.is_verified || ec.qev_status === 'valid' || ec.seznam_status === 'likely_valid'
  );
}

interface WaveLeadsManagerProps {
  waveId: string;
  waveLeads: WaveLeadRow[];
  waveStatus: string;
  teamId: string | null | undefined;
  templates: EmailTemplate[];
  variables?: TemplateVariable[];
  onForceSend?: (item: EmailQueue) => void;
  forceSending?: boolean;
}

const TH: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const,
};

export default function WaveLeadsManager({ waveId, waveLeads, waveStatus, teamId, templates, variables, onForceSend, forceSending }: WaveLeadsManagerProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingQueue, setEditingQueue] = useState<EmailQueue | null>(null);
  const removeFromWave = useRemoveLeadFromWave();

  const canAddLeads = waveStatus === 'draft';
  const canModifyLeads = ['draft', 'paused'].includes(waveStatus);

  async function handleRemoveFromWave(wl: WaveLeadRow) {
    if (!window.confirm(`Odebrat "${wl.leads?.company_name ?? 'lead'}" z vlny?\nStav leadu bude nastaven zpět na "připraven".`)) return;
    try {
      await removeFromWave.mutateAsync({ waveLeadId: wl.id, leadId: wl.lead_id });
      toast.success('Lead odebrán z vlny');
    } catch (e: unknown) {
      toast.error('Chyba: ' + ((e as Error)?.message ?? 'neznámá chyba'));
    }
  }

  const COL_COUNT = 10; // chevron + 8 data cols + action

  return (
    <GlassCard padding={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          Leady ve vlně <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({waveLeads.length})</span>
        </h3>
        {canAddLeads && (
          <GlassButton size="sm" variant="primary" onClick={() => setShowAdd(true)}>+ Přidat leady</GlassButton>
        )}
      </div>

      {!waveLeads.length ? (
        <EmptyState
          icon="◈"
          title="Žádné leady"
          description="Přidejte leady do vlny."
          action={canAddLeads ? <GlassButton onClick={() => setShowAdd(true)}>+ Přidat leady</GlassButton> : undefined}
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 28, padding: '9px 4px 9px 12px' }} />
                <th style={TH}>Stav</th>
                <th style={TH}>Firma</th>
                <th style={TH}>IČO</th>
                <th style={TH}>Email</th>
                <th style={TH}>Email stav</th>
                <th style={{ ...TH, textAlign: 'center' }}>Email ✓</th>
                <th style={TH}>Odesláno</th>
                <th style={TH}>Odpověď</th>
                {canModifyLeads && <th style={TH} />}
              </tr>
            </thead>
            <tbody>
              {waveLeads.map(wl => {
                const allCandidates = (wl.leads?.jednatels ?? []).flatMap((j: Jednatel & { email_candidates?: EmailCandidate[] }) => j.email_candidates ?? []);
                const bestCand = allCandidates.find((e: EmailCandidate) => e.is_verified) ?? allCandidates[0] ?? null;
                const emailAddr = bestCand?.email_address ?? null;
                const emailStatus: string | null = wl.leads?.status === 'info_email'
                  ? 'info_email'
                  : bestCand
                  ? (bestCand.qev_status && bestCand.qev_status !== 'unknown' ? bestCand.qev_status : bestCand.seznam_status ?? null)
                  : null;
                const emailOk = hasUsableEmail(wl);
                const isExpanded = expandedId === wl.id;

                return (
                  <Fragment key={wl.id}>
                    <tr
                      style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : wl.id)}
                    >
                      <td style={{ padding: '10px 4px 10px 12px', fontSize: 12, color: 'var(--text-muted)', width: 28 }}>
                        <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          ▶
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {(() => {
                          const s = WAVE_LEAD_STATUS_MAP[wl.status as keyof typeof WAVE_LEAD_STATUS_MAP] ?? { label: wl.status, color: 'muted' };
                          const c = STATUS_COLOR_MAP[s.color] ?? STATUS_COLOR_MAP.muted;
                          return (
                            <span style={{
                              display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                              fontSize: 11, fontWeight: 600,
                              background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                            }}>
                              {s.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                        {wl.leads?.company_name ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {wl.leads?.ico ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {emailAddr ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <EmailStatusBadge status={emailStatus} />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {emailOk
                          ? <span style={{ fontSize: 13, color: '#3ECF8E', fontWeight: 700 }}>✓</span>
                          : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {wl.sent_emails?.length ?? 0}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: wl.lead_replies?.length ? 'var(--green)' : 'var(--text-muted)' }}>
                        {wl.lead_replies?.length ? '✓' : '—'}
                      </td>
                      {canModifyLeads && (
                        <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                          <GlassButton
                            size="sm"
                            variant="danger"
                            onClick={() => handleRemoveFromWave(wl)}
                            disabled={removeFromWave.isPending}
                          >
                            Odebrat
                          </GlassButton>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr key={`${wl.id}-expand`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={COL_COUNT} style={{ padding: '0 12px 12px 40px', background: 'rgba(0,0,0,0.08)' }}>
                          <EmailSequenceCards
                            waveStatus={waveStatus}
                            waveLead={wl}
                            templates={templates}
                            onEdit={setEditingQueue}
                            onForceSend={onForceSend}
                            forceSending={forceSending}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddLeadsToWaveDialog open={showAdd} onClose={() => setShowAdd(false)} waveId={waveId} teamId={teamId} />

      <EmailEditModal
        item={editingQueue}
        waveId={waveId}
        onClose={() => setEditingQueue(null)}
        variables={variables}
      />
    </GlassCard>
  );
}
