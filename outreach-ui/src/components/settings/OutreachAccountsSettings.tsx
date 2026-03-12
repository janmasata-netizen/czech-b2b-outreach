import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import { useOutreachAccounts, useUpsertOutreachAccount } from '@/hooks/useSettings';
import { useTeams } from '@/hooks/useLeads';
import type { OutreachAccount } from '@/types/database';
import { toast } from 'sonner';

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };

export default function OutreachAccountsSettings() {
  const { data: accounts, isLoading } = useOutreachAccounts();
  const { data: teams } = useTeams();
  const upsert = useUpsertOutreachAccount();
  const [editing, setEditing] = useState<Partial<OutreachAccount> | null>(null);

  async function handleSave() {
    if (!editing?.email_address) { toast.error('Zadejte e-mailovou adresu', { duration: 8000 }); return; }
    try {
      await upsert.mutateAsync(editing);
      toast.success('Účet uložen');
      setEditing(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message.includes('unique') ? 'Tým již má outreach účet' : 'Chyba při ukládání', { duration: 8000 });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <PageHeader
      title="Outreach účty"
      actions={<GlassButton size="sm" variant="primary" onClick={() => setEditing({ email_address: '', smtp_credential_name: '', team_id: teams?.[0]?.id })}>+ Nový účet</GlassButton>}
    />
    <GlassCard padding={20}>

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(accounts ?? []).map(acc => (
            <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{acc.email_address}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  SMTP: <span style={{ color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>{acc.smtp_credential_name}</span>
                  {acc.daily_send_limit && (
                    <span style={{ marginLeft: 12 }}>
                      Odesláno dnes: <span style={{ fontFamily: 'JetBrains Mono, monospace', color: (acc.sends_today ?? 0) >= acc.daily_send_limit ? '#ef4444' : 'var(--text)' }}>{acc.sends_today ?? 0}/{acc.daily_send_limit}</span>
                    </span>
                  )}
                </div>
              </div>
              <GlassButton size="sm" onClick={() => setEditing(acc)}>Upravit</GlassButton>
            </div>
          ))}
          {!accounts?.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádné outreach účty</p>}
        </div>
      )}

      <GlassModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Upravit outreach účet' : 'Nový outreach účet'}
        width={500}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setEditing(null)}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSave} disabled={upsert.isPending}>{upsert.isPending ? 'Ukládám…' : 'Uložit'}</GlassButton>
          </>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <GlassInput label="E-mailová adresa" placeholder="outreach@firma.cz" value={editing.email_address ?? ''} onChange={e => setEditing(prev => ({ ...prev!, email_address: e.target.value }))} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
            <GlassInput label="Název SMTP credentialu (n8n)" placeholder="Burner SMTP" value={editing.smtp_credential_name ?? ''} onChange={e => setEditing(prev => ({ ...prev!, smtp_credential_name: e.target.value }))} />
            <GlassInput label="Denní limit odesílání" type="number" value={String(editing.daily_send_limit ?? '')} onChange={e => setEditing(prev => ({ ...prev!, daily_send_limit: Number(e.target.value) || undefined }))} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={LABEL}>Tým</label>
              <select className="glass-input" value={editing.team_id ?? ''} onChange={e => setEditing(prev => ({ ...prev!, team_id: e.target.value }))}>
                {(teams ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </GlassModal>
    </GlassCard>
    </div>
  );
}
