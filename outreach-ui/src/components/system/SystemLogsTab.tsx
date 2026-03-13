import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useEnrichmentLogs, useEmailSendLogs, useReplyLogs, useSystemEvents,
  type EnrichmentLogRow, type SentEmailLog, type ReplyLog,
} from '@/hooks/useSystemLogs';
import type { SystemEvent } from '@/types/database';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';

type LogTab = 'enrichment' | 'emails' | 'replies' | 'events';

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400,
        border: active ? '1px solid var(--green)' : '1px solid var(--border)',
        background: active ? 'rgba(62,207,142,0.08)' : 'transparent',
        color: active ? 'var(--green)' : 'var(--text-dim)',
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}

// ── Enrichment sub-tab ──
function EnrichmentSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useEnrichmentLogs(page, statusFilter || undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="">{t('systemLogs.allSteps')}</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {isLoading ? <Loader /> : !data?.length ? <Empty t={t} /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['lead', 'step', 'status', 'error', 'timestamp'].map(h => (
                    <th key={h} style={thStyle}>{t(`systemLogs.tableHeaders.${h}` as 'systemLogs.tableHeaders.lead')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row: EnrichmentLogRow) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={tdStyle}>{row.leads?.company_name ?? row.lead_id.slice(0, 8)}</td>
                    <td style={tdStyle}>{row.step}</td>
                    <td style={tdStyle}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {row.error_message ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(row.created_at).toLocaleString('cs-CZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} hasMore={data.length >= 50} t={t} />
        </>
      )}
    </div>
  );
}

// ── Email send history sub-tab ──
function EmailsSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useEmailSendLogs(page);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isLoading ? <Loader /> : !data?.length ? <Empty t={t} /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['to', 'subject', 'wave', 'sentAt'].map(h => (
                    <th key={h} style={thStyle}>{t(`systemLogs.tableHeaders.${h}` as 'systemLogs.tableHeaders.to')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row: SentEmailLog) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={tdStyle}>{row.email_address}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.subject ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>
                      {row.wave_leads?.waves?.name ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(row.sent_at).toLocaleString('cs-CZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} hasMore={data.length >= 50} t={t} />
        </>
      )}
    </div>
  );
}

// ── Reply detection sub-tab ──
function RepliesSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useReplyLogs(page);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isLoading ? <Loader /> : !data?.length ? <Empty t={t} /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['from', 'subject', 'matchedLead', 'processedAt'].map(h => (
                    <th key={h} style={thStyle}>{t(`systemLogs.tableHeaders.${h}` as 'systemLogs.tableHeaders.from')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row: ReplyLog) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={tdStyle}>{row.from_email ?? '—'}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.subject ?? '—'}
                    </td>
                    <td style={tdStyle}>
                      {row.source === 'unmatched' ? (
                        <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 500 }}>{t('systemLogs.unmatched')}</span>
                      ) : (
                        <span style={{ color: 'var(--text)' }}>{row.leads?.company_name ?? row.lead_id?.slice(0, 8) ?? '—'}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(row.created_at).toLocaleString('cs-CZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} hasMore={data.length >= 50} t={t} />
        </>
      )}
    </div>
  );
}

// ── System events sub-tab ──
function EventsSection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const { data, isLoading } = useSystemEvents(page, typeFilter || undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="">{t('systemLogs.allTypes')}</option>
          {['login', 'config_change', 'wave_created', 'error'].map(tp => (
            <option key={tp} value={tp}>{tp}</option>
          ))}
        </select>
      </div>
      {isLoading ? <Loader /> : !data?.length ? <Empty t={t} /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['eventType', 'actor', 'description', 'timestamp'].map(h => (
                    <th key={h} style={thStyle}>{t(`systemLogs.tableHeaders.${h}` as 'systemLogs.tableHeaders.eventType')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row: SystemEvent) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: 'rgba(62,207,142,0.08)', color: 'var(--green)',
                      }}>
                        {row.event_type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-dim)' }}>{row.profiles?.full_name ?? '—'}</td>
                    <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(row.created_at).toLocaleString('cs-CZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} hasMore={data.length >= 50} t={t} />
        </>
      )}
    </div>
  );
}

// ── Shared helpers ──
const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)' };
const trStyle: React.CSSProperties = { borderBottom: '1px solid var(--border)' };

function StatusBadge({ status }: { status: string }) {
  const color = status === 'success' ? 'var(--green)' : status === 'failed' ? '#f87171' : 'var(--text-dim)';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color, background: `${color}15` }}>
      {status}
    </span>
  );
}

function Loader() {
  return <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: 16 }}>Loading...</div>;
}

function Empty({ t }: { t: (key: string) => string }) {
  return (
    <GlassCard padding={20}>
      <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>{t('systemLogs.noLogs')}</div>
    </GlassCard>
  );
}

function Pagination({ page, setPage, hasMore, t }: { page: number; setPage: (p: number) => void; hasMore: boolean; t: (key: string) => string }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {page > 0 && (
        <GlassButton variant="secondary" onClick={() => setPage(page - 1)} style={{ fontSize: 11 }}>
          {t('pagination.previous')}
        </GlassButton>
      )}
      {hasMore && (
        <GlassButton variant="secondary" onClick={() => setPage(page + 1)} style={{ fontSize: 11 }}>
          {t('systemLogs.loadMore')}
        </GlassButton>
      )}
    </div>
  );
}

// ── Main component ──
export default function SystemLogsTab() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<LogTab>('enrichment');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <PillButton active={tab === 'enrichment'} onClick={() => setTab('enrichment')}>{t('systemLogs.enrichment')}</PillButton>
        <PillButton active={tab === 'emails'} onClick={() => setTab('emails')}>{t('systemLogs.emails')}</PillButton>
        <PillButton active={tab === 'replies'} onClick={() => setTab('replies')}>{t('systemLogs.replies')}</PillButton>
        <PillButton active={tab === 'events'} onClick={() => setTab('events')}>{t('systemLogs.systemEvents')}</PillButton>
      </div>

      {/* Tab content */}
      {tab === 'enrichment' && <EnrichmentSection />}
      {tab === 'emails' && <EmailsSection />}
      {tab === 'replies' && <RepliesSection />}
      {tab === 'events' && <EventsSection />}
    </div>
  );
}
