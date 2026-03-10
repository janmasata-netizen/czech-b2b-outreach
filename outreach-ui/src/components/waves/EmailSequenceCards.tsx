import { QUEUE_STATUS_MAP, STATUS_COLOR_MAP } from '@/lib/constants';
import { renderTemplate, buildTemplateContext } from '@/lib/templateRenderer';
import type { EmailTemplate, EmailQueue } from '@/types/database';

const SEQ_COLORS: Record<number, { accent: string; bg: string; border: string }> = {
  1: { accent: '#3ECF8E', bg: 'rgba(62,207,142,0.06)', border: 'rgba(62,207,142,0.2)' },
  2: { accent: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.2)' },
  3: { accent: '#22d3ee', bg: 'rgba(34,211,238,0.06)', border: 'rgba(34,211,238,0.2)' },
};

function QueueStatusBadge({ status }: { status: string }) {
  const entry = (QUEUE_STATUS_MAP as Record<string, { label: string; color: string }>)[status];
  const label = entry?.label ?? status;
  const colorKey = entry?.color ?? 'muted';
  const colors = STATUS_COLOR_MAP[colorKey] ?? STATUS_COLOR_MAP.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: colors.text }} />
      {label}
    </span>
  );
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Strip HTML tags for plain-text preview, truncate */
function plainPreview(html: string | null | undefined, maxLen = 150): string {
  if (!html) return '';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

interface EmailSequenceCardsProps {
  waveStatus: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waveLead: any;
  templates: EmailTemplate[];
  onEdit: (item: EmailQueue) => void;
  onForceSend?: (item: EmailQueue) => void;
  forceSending?: boolean;
}

export default function EmailSequenceCards({ waveStatus, waveLead, templates, onEdit, onForceSend, forceSending }: EmailSequenceCardsProps) {
  const isDraft = waveStatus === 'draft';
  const queueItems: EmailQueue[] = waveLead.email_queue ?? [];

  // Build context for draft rendering
  const lead = waveLead.leads;
  const jednatels = lead?.jednatels ?? [];
  const jednatel = jednatels[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCandidates = jednatels.flatMap((j: any) => j.email_candidates ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bestCand = allCandidates.find((e: any) => e.is_verified) ?? allCandidates[0] ?? null;
  const emailAddr = bestCand?.email_address ?? null;
  const ctx = buildTemplateContext(lead, jednatel);
  const variant = waveLead.ab_variant ?? 'A';

  // Compute actual sequence numbers from data
  const draftSeqs = [...new Set(templates.map(t => t.sequence_number))].sort((a, b) => a - b);
  const queueSeqs = [...new Set(queueItems.map(q => q.sequence_number))].sort((a, b) => (a as number) - (b as number));
  const seqs = isDraft ? draftSeqs : queueSeqs;

  if (seqs.length === 0) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {isDraft ? 'Žádné šablony přiřazeny' : 'Nenaplánováno'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
      {seqs.map(seq => {
        const sc = SEQ_COLORS[seq] ?? SEQ_COLORS[1];

        if (isDraft) {
          // Draft mode — render templates client-side
          const tpl = templates.find(
            t => t.sequence_number === seq && (t.variant === variant || t.ab_variant === variant)
          );
          const subject = tpl ? renderTemplate(tpl.subject, ctx) : null;
          const body = tpl ? renderTemplate(tpl.body_html, ctx) : null;

          return (
            <div key={seq} style={{
              border: `1px solid ${sc.border}`, borderRadius: 8,
              background: sc.bg, padding: '12px 16px',
              borderLeft: `3px solid ${sc.accent}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                    color: sc.accent, background: `${sc.accent}18`, padding: '1px 6px', borderRadius: 3,
                  }}>SEQ{seq}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: '#71717a',
                    background: 'rgba(82,82,91,0.15)', padding: '1px 7px', borderRadius: 4,
                    border: '1px solid rgba(82,82,91,0.3)',
                  }}>Koncept</span>
                </div>
              </div>
              {tpl ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {subject || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>(bez předmětu)</span>}
                  </div>
                  {emailAddr && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                      {emailAddr}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    {plainPreview(body)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Šablona pro tuto sekvenci chybí
                </div>
              )}
            </div>
          );
        }

        // Queue mode — show actual email_queue data
        const qi = queueItems.find(q => q.sequence_number === seq);
        if (!qi) {
          return (
            <div key={seq} style={{
              border: `1px solid var(--border)`, borderRadius: 8,
              background: 'var(--bg-subtle)', padding: '12px 16px',
              borderLeft: `3px solid ${sc.accent}`, opacity: 0.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                  color: sc.accent, background: `${sc.accent}18`, padding: '1px 6px', borderRadius: 3,
                }}>SEQ{seq}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Nenaplánováno
                </span>
              </div>
            </div>
          );
        }

        const canEdit = qi.status === 'queued' || qi.status === 'pending_prev';
        const prevSeqSent = qi.status === 'pending_prev' && queueItems.some(
          q => q.sequence_number === seq - 1 && q.status === 'sent'
        );
        const canForceSend = prevSeqSent && !!onForceSend;

        return (
          <div key={seq} style={{
            border: `1px solid ${sc.border}`, borderRadius: 8,
            background: sc.bg, padding: '12px 16px',
            borderLeft: `3px solid ${sc.accent}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                  color: sc.accent, background: `${sc.accent}18`, padding: '1px 6px', borderRadius: 3,
                }}>SEQ{seq}</span>
                <QueueStatusBadge status={qi.status} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {canForceSend && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onForceSend!(qi); }}
                    disabled={forceSending}
                    style={{
                      background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
                      color: '#fbbf24', fontSize: 11, fontWeight: 600, padding: '3px 10px',
                      borderRadius: 4, cursor: forceSending ? 'not-allowed' : 'pointer',
                      opacity: forceSending ? 0.5 : 1,
                    }}
                  >
                    {forceSending ? 'Odesílám…' : 'Odeslat hned'}
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(qi); }}
                    style={{
                      background: 'rgba(62,207,142,0.1)', border: '1px solid rgba(62,207,142,0.25)',
                      color: '#3ECF8E', fontSize: 11, fontWeight: 600, padding: '3px 10px',
                      borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    Upravit
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {qi.subject_rendered ?? '(bez předmětu)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{qi.email_address}</span>
              {qi.scheduled_at && (
                <span style={{ color: 'var(--text-dim)' }}>{fmtDateTime(qi.scheduled_at)}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              {plainPreview(qi.body_rendered)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
