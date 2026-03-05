import GlassCard from '@/components/glass/GlassCard';

interface Jednatel {
  id: string;
  full_name: string | null;
  role: string | null;
  email_status?: string | null;
}

interface JednatelsCardProps {
  jednatels: Jednatel[];
}

const EMAIL_STATUS_LABEL: Record<string, string> = {
  email_found:     'Email nalezen',
  email_not_found: 'Email nenalezen',
  pending:         'Čeká na ověření',
};

const EMAIL_STATUS_COLOR: Record<string, string> = {
  email_found:     'var(--green)',
  email_not_found: 'var(--red)',
  pending:         'var(--text-muted)',
};

const EMAIL_STATUS_BG: Record<string, string> = {
  email_found:     'rgba(62,207,142,0.1)',
  email_not_found: 'rgba(248,113,113,0.1)',
  pending:         'rgba(82,82,91,0.15)',
};

export default function JednatelsCard({ jednatels }: JednatelsCardProps) {
  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Jednatelé</h3>
      {!jednatels.length ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Žádní jednatelé nenalezeni</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jednatels.map(j => {
            const status = j.email_status ?? 'pending';
            return (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(62,207,142,0.1)', border: '1px solid rgba(62,207,142,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>
                  {(j.full_name ?? '?').slice(0, 1)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{j.full_name ?? '—'}</div>
                  {j.role && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{j.role}</div>}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: EMAIL_STATUS_COLOR[status] ?? 'var(--text-muted)',
                  background: EMAIL_STATUS_BG[status] ?? 'rgba(82,82,91,0.15)',
                  padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                }}>
                  {EMAIL_STATUS_LABEL[status] ?? status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
