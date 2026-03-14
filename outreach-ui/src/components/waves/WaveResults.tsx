import GlassCard from '@/components/glass/GlassCard';
import StatCard from '@/components/shared/StatCard';
import type { WaveAnalytics, WaveLeadRow, SentEmail } from '@/types/database';
import { formatPercent } from '@/lib/utils';

interface WaveResultsProps {
  wave: WaveAnalytics;
  waveLeads?: WaveLeadRow[];
}

const SEQ_COLORS = ['#3ECF8E', '#a78bfa', '#22d3ee'] as const;

function fmtSeqDate(date: string | null | undefined, time: string | null | undefined): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-');
  const t = time ?? '08:00';
  return `${d}.${m}.${y} ${t.slice(0, 5)}`;
}

function fmtSentAt(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}

export default function WaveResults({ wave, waveLeads = [] }: WaveResultsProps) {
  const total = wave.lead_count || waveLeads.length;

  // Count sent emails per sequence from waveLeads + find earliest sent_at
  const seqCounts = [1, 2, 3].map(seq => {
    let count = 0;
    let earliestSentAt: string | null = null;
    for (const wl of waveLeads) {
      const seqEmails = (wl.sent_emails ?? []).filter((e: SentEmail) => e.sequence_number === seq);
      if (seqEmails.length > 0) count++;
      for (const e of seqEmails) {
        if (e.sent_at && (!earliestSentAt || e.sent_at < earliestSentAt)) {
          earliestSentAt = e.sent_at;
        }
      }
    }
    const dateKey = `send_date_seq${seq}`;
    const timeKey = `send_time_seq${seq}`;
    let scheduled = fmtSeqDate(wave[dateKey as keyof WaveAnalytics] as string | null, wave[timeKey as keyof WaveAnalytics] as string | null);

    // Fallback: derive scheduled date from email_queue if wave-level date is null
    if (!scheduled) {
      let earliestScheduledAt: string | null = null;
      for (const wl of waveLeads) {
        for (const qi of (wl.email_queue ?? [])) {
          if (qi.sequence_number === seq && qi.scheduled_at && qi.status !== 'cancelled') {
            if (!earliestScheduledAt || qi.scheduled_at < earliestScheduledAt)
              earliestScheduledAt = qi.scheduled_at;
          }
        }
      }
      if (earliestScheduledAt) scheduled = fmtSentAt(earliestScheduledAt);
    }

    return { seq, count, scheduled, earliestSentAt };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard label="Celkem leadů" value={wave.lead_count} icon="◈" color="var(--green)" />
        <StatCard label="Odesláno" value={wave.sent_count} icon="✉" color="var(--purple)" />
        <StatCard label="Odpovědí" value={wave.reply_count} icon="↩" color="var(--green)" />
        <StatCard label="Reply rate" value={formatPercent(wave.reply_rate)} icon="%" color="var(--cyan)" />
      </div>

      {/* Sequence breakdown — only show if there's any data */}
      {total > 0 && (
        <GlassCard padding={20}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
            Průběh sekvencí
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {seqCounts.map(({ seq, count, scheduled, earliestSentAt }) => {
              const pct = total > 0 ? (count / total) * 100 : 0;
              const color = SEQ_COLORS[seq - 1];
              const isSent = count > 0 && earliestSentAt;
              return (
                <div key={seq}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Sekvence {seq}</span>
                    <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                      {count} / {total} odesláno
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: color,
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                      opacity: 0.85,
                    }} />
                  </div>
                  {isSent ? (
                    <div style={{ marginTop: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color, opacity: 0.7 }}>
                      Odesláno {fmtSentAt(earliestSentAt)}
                    </div>
                  ) : scheduled ? (
                    <div style={{ marginTop: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)', opacity: 0.7 }}>
                      Naplánováno {scheduled}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
