import { useMemo, useId, useState, useCallback } from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import GlassCard from '@/components/glass/GlassCard';
import StatCard from '@/components/shared/StatCard';
import type { WaveAnalytics, WaveLeadRow, SentEmail, EmailQueue, LeadReply } from '@/types/database';
import { formatPercent } from '@/lib/utils';

interface WaveResultsProps {
  wave: WaveAnalytics;
  waveLeads?: WaveLeadRow[];
}

const SEQ_COLORS = ['#3ECF8E', '#a78bfa', '#22d3ee', '#fb923c', '#f472b6'];

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

  // Discover all sequence numbers dynamically from data
  const seqNumbers = useMemo(() => {
    const allSeqNums = new Set<number>();
    for (const wl of waveLeads) {
      for (const e of (wl.sent_emails ?? [])) allSeqNums.add(e.sequence_number);
      for (const qi of (wl.email_queue ?? []) as EmailQueue[]) allSeqNums.add(qi.sequence_number);
    }
    if (wave.sequence_schedule?.length) {
      for (const e of wave.sequence_schedule) allSeqNums.add(e.seq);
    }
    if (allSeqNums.size === 0) { allSeqNums.add(1); allSeqNums.add(2); allSeqNums.add(3); }
    return Array.from(allSeqNums).sort((a, b) => a - b);
  }, [waveLeads, wave.sequence_schedule]);

  // Count sent emails per sequence from waveLeads + find earliest sent_at
  const seqCounts = seqNumbers.map(seq => {
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

    // Read scheduled date from sequence_schedule JSONB first, then legacy columns
    let scheduled: string | null = null;
    if (wave.sequence_schedule?.length) {
      const entry = wave.sequence_schedule.find(e => e.seq === seq);
      if (entry) {
        // Show date range for drip waves (send_date_end differs from send_date)
        if (entry.send_date_end && entry.send_date_end !== entry.send_date) {
          const startFmt = fmtSeqDate(entry.send_date, entry.send_time);
          const [y2, m2, d2] = (entry.send_date_end || '').split('-');
          scheduled = startFmt ? `${startFmt} – ${d2}.${m2}.${y2}` : null;
        } else {
          scheduled = fmtSeqDate(entry.send_date, entry.send_time);
        }
      }
    }
    if (!scheduled && seq <= 3) {
      const dateKey = `send_date_seq${seq}`;
      const timeKey = `send_time_seq${seq}`;
      scheduled = fmtSeqDate(wave[dateKey as keyof WaveAnalytics] as string | null, wave[timeKey as keyof WaveAnalytics] as string | null);
    }

    // Fallback: derive scheduled date from email_queue if wave-level date is null
    if (!scheduled) {
      let earliestScheduledAt: string | null = null;
      for (const wl of waveLeads) {
        for (const qi of (wl.email_queue ?? []) as EmailQueue[]) {
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

  const rawId = useId().replace(/:/g, '_');

  const [hovered, setHovered] = useState<{ label: string; desc: string; color: string; x: number; y: number } | null>(null);

  const handleChartHover = useCallback((e: React.MouseEvent) => {
    const target = e.target as SVGElement;

    // Check if hovering an area (fill or stroke)
    const areaGroup = target.closest('.recharts-area');
    if (areaGroup) {
      const svg = target.closest('svg');
      if (svg) {
        const areas = Array.from(svg.querySelectorAll(':scope .recharts-layer.recharts-area'));
        const index = areas.indexOf(areaGroup as Element);
        if (index >= 0 && index < seqNumbers.length) {
          const seq = seqNumbers[index];
          setHovered({
            label: `Sekvence ${seq}`,
            desc: `Kumulativni pocet odeslanych emailu v ${seq}. sekvenci`,
            color: SEQ_COLORS[(seq - 1) % SEQ_COLORS.length],
            x: e.clientX, y: e.clientY,
          });
          return;
        } else if (index === seqNumbers.length) {
          setHovered({
            label: 'Odpovedi',
            desc: 'Celkovy pocet prijatych odpovedi',
            color: '#f472b6',
            x: e.clientX, y: e.clientY,
          });
          return;
        }
      }
    }

    // Check if hovering the reply rate line
    const lineGroup = target.closest('.recharts-line');
    if (lineGroup) {
      setHovered({
        label: 'Reply rate',
        desc: 'Pomer odpovedi ku vsem odeslanym emailum (%)',
        color: 'var(--cyan)',
        x: e.clientX, y: e.clientY,
      });
      return;
    }

    setHovered(null);
  }, [seqNumbers]);

  const handleChartLeave = useCallback(() => setHovered(null), []);

  const chartData = useMemo(() => {
    const dayBuckets: Record<string, Record<string, number>> = {};

    // Bucket sent emails by date + sequence
    for (const wl of waveLeads) {
      for (const e of (wl.sent_emails ?? [])) {
        if (!e.sent_at) continue;
        const day = e.sent_at.slice(0, 10);
        if (!dayBuckets[day]) dayBuckets[day] = {};
        const key = `seq${e.sequence_number}`;
        dayBuckets[day][key] = (dayBuckets[day][key] ?? 0) + 1;
      }
    }

    // Bucket replies by date
    for (const wl of waveLeads) {
      for (const r of (wl.lead_replies ?? []) as LeadReply[]) {
        const day = (r.received_at ?? r.created_at)?.slice(0, 10);
        if (!day) continue;
        if (!dayBuckets[day]) dayBuckets[day] = {};
        dayBuckets[day]._replies = (dayBuckets[day]._replies ?? 0) + 1;
      }
    }

    const sortedDays = Object.keys(dayBuckets).sort();
    if (sortedDays.length === 0) return [];

    let cumTotalSent = 0;
    let cumReplies = 0;
    const seqCumulative: Record<string, number> = {};

    return sortedDays.map(day => {
      const bucket = dayBuckets[day];
      const row: Record<string, unknown> = {};

      // Format date as DD.MM
      const [, m, d] = day.split('-');
      row.date = `${d}.${m}`;

      // Cumulative per sequence
      for (const seq of seqNumbers) {
        const key = `seq${seq}`;
        const daySent = bucket[key] ?? 0;
        seqCumulative[key] = (seqCumulative[key] ?? 0) + daySent;
        cumTotalSent += daySent;
        row[key] = seqCumulative[key];
      }

      // Cumulative replies
      cumReplies += bucket._replies ?? 0;
      row.replies = cumReplies;

      // Reply rate
      row.replyRate = cumTotalSent > 0 ? Math.round((cumReplies / cumTotalSent) * 1000) / 10 : 0;

      return row;
    });
  }, [waveLeads, seqNumbers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard label="Celkem leadů" value={wave.lead_count} icon="◈" color="var(--green)" />
        <StatCard label="Odesláno" value={wave.sent_count} icon="✉" color="var(--purple)" />
        <StatCard label="Odpovědí" value={wave.reply_count} icon="↩" color="var(--green)" />
        <StatCard label="Reply rate" value={formatPercent(wave.reply_rate)} icon="%" color="var(--cyan)" />
      </div>

      {(chartData.length > 0 || (wave.sent_count ?? 0) > 0) && (
        <GlassCard padding={20}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
            Průběh odesílání
          </h3>
          {chartData.length > 0 ? (
            <div onMouseMove={handleChartHover} onMouseLeave={handleChartLeave}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    {seqNumbers.map((seq) => {
                      const color = SEQ_COLORS[(seq - 1) % SEQ_COLORS.length];
                      return (
                        <linearGradient key={seq} id={`grad_seq${seq}_${rawId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      );
                    })}
                    <linearGradient id={`grad_replies_${rawId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis yAxisId="right" orientation="right" hide />
                  {seqNumbers.map((seq) => {
                    const color = SEQ_COLORS[(seq - 1) % SEQ_COLORS.length];
                    return (
                      <Area
                        key={seq}
                        yAxisId="left"
                        type="monotone"
                        dataKey={`seq${seq}`}
                        name={`Sekvence ${seq}`}
                        stackId="sent"
                        stroke={color}
                        fill={`url(#grad_seq${seq}_${rawId})`}
                        activeDot={false}
                      />
                    );
                  })}
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="replies"
                    name="Odpovědi"
                    stroke="#f472b6"
                    strokeDasharray="5 3"
                    fill={`url(#grad_replies_${rawId})`}
                    activeDot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="replyRate"
                    name="Reply rate %"
                    stroke="var(--cyan)"
                    strokeDasharray="3 3"
                    dot={false}
                    strokeWidth={2}
                    activeDot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {hovered && (
                <div style={{
                  position: 'fixed',
                  left: hovered.x + 12,
                  top: hovered.y - 10,
                  pointerEvents: 'none',
                  zIndex: 1000,
                  background: 'var(--bg-surface)',
                  border: `1px solid ${hovered.color}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  color: 'var(--text)',
                  maxWidth: 240,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                  <div style={{ fontWeight: 600, color: hovered.color, marginBottom: 2 }}>{hovered.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hovered.desc}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-muted)', fontSize: 13 }}>
              Data se načítají z odeslaných emailů
            </div>
          )}
        </GlassCard>
      )}

      {/* Sequence breakdown — only show if there's any data */}
      {total > 0 && (
        <GlassCard padding={20}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
            Průběh sekvencí
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {seqCounts.map(({ seq, count, scheduled, earliestSentAt }) => {
              const pct = total > 0 ? (count / total) * 100 : 0;
              const color = SEQ_COLORS[(seq - 1) % SEQ_COLORS.length];
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
