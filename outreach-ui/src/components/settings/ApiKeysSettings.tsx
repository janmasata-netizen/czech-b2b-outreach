import { useState, useEffect } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import SecretInput from '@/components/shared/SecretInput';
import { useConfigEntries, useUpsertConfig } from '@/hooks/useSettings';
import { toast } from 'sonner';

const CONFIG_FIELDS = [
  { key: 'seznam_from_email', label: 'Seznam FROM e-mail', placeholder: 'sender@seznam.cz', secret: false },
  { key: 'qev_api_key_1', label: 'QEV API klíč #1', placeholder: 'qev_xxxxxxxxxxxx', secret: true },
  { key: 'qev_api_key_2', label: 'QEV API klíč #2', placeholder: 'qev_xxxxxxxxxxxx', secret: true },
  { key: 'qev_api_key_3', label: 'QEV API klíč #3', placeholder: 'qev_xxxxxxxxxxxx', secret: true },
  { key: 'retarget_lockout_days', label: 'Retarget lockout (dny)', placeholder: '120', secret: false },
];

export default function ApiKeysSettings() {
  const { data: entries, isLoading } = useConfigEntries();
  const upsertConfig = useUpsertConfig();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (entries) {
      const map: Record<string, string> = {};
      entries.forEach(e => { map[e.key] = e.value ?? ''; });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues(map);
    }
  }, [entries]);

  async function handleSave(key: string) {
    try {
      await upsertConfig.mutateAsync({ key, value: values[key] ?? '' });
      toast.success('Uloženo');
    } catch {
      toast.error('Chyba při ukládání', { duration: 8000 });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    <PageHeader title="API klíče" />
    <GlassCard padding={20}>

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {CONFIG_FIELDS.map(field => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  {field.secret ? (
                    <SecretInput
                      label={field.label}
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{field.label}</label>
                      <input
                        className="glass-input"
                        placeholder={field.placeholder}
                        value={values[field.key] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                      />
                    </div>
                  )}
                </div>
                <GlassButton size="sm" variant="primary" onClick={() => handleSave(field.key)} disabled={upsertConfig.isPending}>
                  Uložit
                </GlassButton>
              </div>
              <div style={{ padding: '6px 10px', background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                  Klíč: <span style={{ color: 'var(--cyan)' }}>{field.key}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
    </div>
  );
}
