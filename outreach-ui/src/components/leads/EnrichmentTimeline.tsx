import React from 'react';
import GlassCard from '@/components/glass/GlassCard';
import { formatDate } from '@/lib/utils';
import { parseISO, isPast } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailCandidate {
  id: string;
  email_address: string;
  is_verified: boolean;
  seznam_status: string | null;
  qev_status: string | null;
}

interface EmailQueueEntry {
  id: string;
  sequence_number: number;
  scheduled_at: string;
  status: string;
}

interface SentEmail {
  id: string;
  sequence_number: number;
  email_address: string;
  sent_at: string;
  jednatel_id: string | null;
}

interface Wave {
  name: string;
  status: string;
  is_dummy?: boolean;
  dummy_email?: string | null;
}

interface WaveLead {
  id: string;
  wave_id: string;
  created_at: string;
  waves: Wave;
  sent_emails?: SentEmail[];
  email_queue?: EmailQueueEntry[];
}

interface LeadReply {
  id: string;
  from_email: string | null;
  subject: string | null;
  body_preview: string | null;
  received_at: string | null;
  created_at: string;
}

interface EnrichmentLog {
  id: string;
  step: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface LeadTimelineProps {
  leadCreatedAt: string;
  companyName: string | null;
  teamName?: string | null;
  emailCandidates: EmailCandidate[];
  jednatels: { email_status: string | null }[];
  waveLeads: WaveLead[];
  leadReplies: LeadReply[];
  enrichmentLog: EnrichmentLog[];
}

// ── Phase state ───────────────────────────────────────────────────────────────

type PhaseState = 'completed' | 'active' | 'blocked' | 'pending';

// ── Sub-components ────────────────────────────────────────────────────────────

function PhaseIcon({ state }: { state: PhaseState }) {
  const base: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    position: 'relative',
  };
  if (state === 'completed') return <div style={{ ...base, background: 'var(--green, #22c55e)', color: '#fff' }}>✓</div>;
  if (state === 'active')    return <div style={{ ...base, background: 'var(--blue, #3b82f6)', color: '#fff' }}>●</div>;
  if (state === 'blocked')   return <div style={{ ...base, background: 'var(--red, #ef4444)', color: '#fff' }}>✗</div>;
  return <div style={{ ...base, border: '2px solid var(--border)', background: 'transparent' }} />;
}

function Connector() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 2, height: 18, background: 'var(--border)' }} />
      </div>
    </div>
  );
}

function PhaseRow({ state, title, date, noDateText, subtitle, children }: {
  state: PhaseState;
  title: string;
  date?: string | null;
  noDateText?: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const muted = state === 'pending';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <PhaseIcon state={state} />
      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: muted ? 'var(--text-muted)' : 'var(--text)' }}>
            {title}
          </span>
          {date ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
              {formatDate(date)}
            </span>
          ) : noDateText ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, fontStyle: 'italic' }}>{noDateText}</span>
          ) : null}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
        {children && <div style={{ marginTop: 8 }}>{children}</div>}
      </div>
    </div>
  );
}

function SequenceTable({ emailQueue, sentEmails, isDummy }: {
  emailQueue: EmailQueueEntry[];
  sentEmails: SentEmail[];
  isDummy?: boolean;
}) {
  const sentMap = new Map(sentEmails.map(se => [se.sequence_number, se]));

  const rows = emailQueue
    .map(eq => {
      const sent = sentMap.get(eq.sequence_number);
      let rowStatus: 'sent' | 'failed' | 'waiting';
      if (sent) {
        rowStatus = 'sent';
      } else {
        try {
          rowStatus = isPast(parseISO(eq.scheduled_at)) ? 'failed' : 'waiting';
        } catch {
          rowStatus = 'waiting';
        }
      }
      return { seq: eq.sequence_number, scheduledAt: eq.scheduled_at, sentAt: sent?.sent_at ?? null, status: rowStatus };
    })
    .sort((a, b) => a.seq - b.seq);

  if (!rows.length) return null;

  const tdBase: React.CSSProperties = { padding: '3px 12px 3px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 };

  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Plánováno', 'Odesláno', 'Stav'].map(h => (
              <th key={h} style={{ ...tdBase, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, paddingBottom: 5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.seq}>
              <td style={{ ...tdBase, color: 'var(--text)' }}>{row.seq}</td>
              <td style={{ ...tdBase, color: 'var(--text)' }}>{formatDate(row.scheduledAt)}</td>
              <td style={{ ...tdBase, color: row.sentAt ? 'var(--text)' : 'var(--text-muted)' }}>
                {row.sentAt ? formatDate(row.sentAt) : '—'}
              </td>
              <td style={{
                ...tdBase,
                color: row.status === 'sent' ? 'var(--green, #22c55e)' : row.status === 'failed' ? 'var(--red, #ef4444)' : 'var(--text-muted)',
              }}>
                {row.status === 'sent' ? '✓ Odesláno' : row.status === 'failed' ? '✗ Selhalo' : '○ Čeká'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isDummy && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
          Testovací vlna — e-maily odesílány na dummy adresu
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EnrichmentTimeline({
  leadCreatedAt,
  companyName,
  teamName,
  emailCandidates,
  jednatels,
  waveLeads,
  leadReplies,
  enrichmentLog,
}: LeadTimelineProps) {
  // Verified emails
  const verifiedEmails = emailCandidates.filter(ec =>
    ec.is_verified || ec.qev_status === 'valid' || ec.seznam_status === 'likely_valid'
  );
  const hasVerifiedEmail = verifiedEmails.length > 0;
  const isInWave = waveLeads.length > 0;
  const allEmailsNotFound = jednatels.length > 0 && jednatels.every(j => j.email_status === 'email_not_found');

  // "Email found" date: earliest success log from qev_verify or seznam_verify
  const emailFoundLog = enrichmentLog
    .filter(log => ['qev_verify', 'seznam_verify'].includes(log.step) && log.status === 'success')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  // Phase 3 state
  const emailPhaseState: PhaseState = hasVerifiedEmail
    ? 'completed'
    : (isInWave && allEmailsNotFound)
      ? 'blocked'
      : 'pending';

  // Chronological wave_leads
  const sortedWaveLeads = [...waveLeads].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // First reply
  const firstReply = leadReplies.length > 0
    ? [...leadReplies].sort((a, b) =>
        (a.received_at ?? a.created_at).localeCompare(b.received_at ?? b.created_at)
      )[0]
    : null;

  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Průběh leadu</h3>
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Phase 1 — Lead přidán */}
        <PhaseRow
          state="completed"
          title="Lead přidán"
          date={leadCreatedAt}
          subtitle={companyName ?? undefined}
        />

        {/* Phases 2–4: one block per wave, or pending placeholders if no wave */}
        {sortedWaveLeads.length === 0 ? (
          <>
            <Connector />
            <PhaseRow state="pending" title="Přidán do vlny" />
            <Connector />
            <PhaseRow state={emailPhaseState} title={emailPhaseState === 'blocked' ? 'E-mail nenalezen' : 'E-mail nalezen'} />
            <Connector />
            <PhaseRow state="pending" title="Kontaktní sekvence" />
          </>
        ) : (
          sortedWaveLeads.map(wl => {
            const isDummy = wl.waves?.is_dummy ?? false;
            const queue = wl.email_queue ?? [];
            const sent = wl.sent_emails ?? [];
            const waveHasQueue = queue.length > 0;
            const allSent = waveHasQueue && queue.every(eq => sent.some(se => se.sequence_number === eq.sequence_number));
            const seqPhaseState: PhaseState = waveHasQueue ? (allSent ? 'completed' : 'active') : 'pending';

            return (
              <React.Fragment key={wl.id}>
                <Connector />

                {/* Phase 2 — Přidán do vlny */}
                <PhaseRow
                  state="completed"
                  title="Přidán do vlny"
                  date={wl.created_at}
                  subtitle={
                    <span>
                      {wl.waves?.name}
                      {teamName && <> · Tým {teamName}</>}
                      {isDummy && (
                        <span style={{
                          marginLeft: 6,
                          background: 'rgba(245,158,11,0.15)',
                          color: 'var(--orange, #f59e0b)',
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: 4,
                          verticalAlign: 'middle',
                        }}>
                          Testovací
                        </span>
                      )}
                    </span>
                  }
                />

                <Connector />

                {/* Phase 3 — E-mail nalezen */}
                <PhaseRow
                  state={emailPhaseState}
                  title={emailPhaseState === 'blocked' ? 'E-mail nenalezen' : 'E-mail nalezen'}
                  date={hasVerifiedEmail ? (emailFoundLog?.created_at ?? null) : null}
                  subtitle={hasVerifiedEmail
                    ? verifiedEmails.map(e => e.email_address).join(', ')
                    : undefined
                  }
                />

                <Connector />

                {/* Phase 4 — Kontaktní sekvence */}
                <PhaseRow
                  state={seqPhaseState}
                  title="Kontaktní sekvence"
                >
                  {waveHasQueue && (
                    <SequenceTable emailQueue={queue} sentEmails={sent} isDummy={isDummy} />
                  )}
                </PhaseRow>
              </React.Fragment>
            );
          })
        )}

        <Connector />

        {/* Phase 5 — Odpověď */}
        <PhaseRow
          state={firstReply ? 'completed' : 'pending'}
          title="Odpověď"
          date={firstReply ? (firstReply.received_at ?? firstReply.created_at) : null}
          noDateText={!firstReply ? '(žádná zatím)' : undefined}
          subtitle={firstReply
            ? (
              <span>
                {firstReply.from_email}
                {firstReply.body_preview && (
                  <> · {firstReply.body_preview.slice(0, 80)}</>
                )}
              </span>
            )
            : undefined
          }
        />

      </div>
    </GlassCard>
  );
}
