import { useState, useEffect, useRef } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { useUpdateWave, useTemplateSets } from '@/hooks/useWaves';
import { useSalesmen, useOutreachAccounts } from '@/hooks/useSettings';
import type { WaveAnalytics, Wave } from '@/types/database';
import { toast } from 'sonner';

interface WaveConfigFormProps {
  wave: WaveAnalytics;
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };

export default function WaveConfigForm({ wave }: WaveConfigFormProps) {
  const { data: templateSets } = useTemplateSets(wave.team_id ?? undefined);
  const { data: salesmen } = useSalesmen(wave.team_id ?? undefined);
  const { data: outreachAccounts } = useOutreachAccounts(wave.team_id ?? undefined);
  const updateWave = useUpdateWave();

  const [form, setForm] = useState({
    name: wave.name ?? '',
    template_set_id: wave.template_set_id ?? '',
    salesman_id: wave.salesman_id ?? '',
    outreach_account_id: wave.outreach_account_id ?? '',
    is_dummy: Boolean(wave.is_dummy),
    dummy_email: wave.dummy_email ?? '',
  });

  useEffect(() => {
    setForm({
      name: wave.name ?? '',
      template_set_id: wave.template_set_id ?? '',
      salesman_id: wave.salesman_id ?? '',
      outreach_account_id: wave.outreach_account_id ?? '',
      is_dummy: Boolean(wave.is_dummy),
      dummy_email: wave.dummy_email ?? '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave.id, wave.template_set_id, wave.salesman_id, wave.outreach_account_id, wave.is_dummy, wave.dummy_email]);

  const savedForm = useRef(form);
  useEffect(() => {
    savedForm.current = {
      name: wave.name ?? '',
      template_set_id: wave.template_set_id ?? '',
      salesman_id: wave.salesman_id ?? '',
      outreach_account_id: wave.outreach_account_id ?? '',
      is_dummy: Boolean(wave.is_dummy),
      dummy_email: wave.dummy_email ?? '',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave.id]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm.current);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    try {
      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          name: form.name,
          template_set_id: form.template_set_id || undefined,
          salesman_id: form.salesman_id || undefined,
          outreach_account_id: form.outreach_account_id || undefined,
          is_dummy: form.is_dummy,
          dummy_email: form.is_dummy ? (form.dummy_email || undefined) : undefined,
        } as Partial<Wave>,
      });
      savedForm.current = { ...form };
      toast.success('Vlna uložena');
    } catch {
      toast.error('Chyba při ukládání vlny');
    }
  }

  const locked = !['draft', 'paused'].includes(wave.status);

  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Konfigurace vlny</h3>

      {locked && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 8,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          fontSize: 12, color: '#fbbf24', fontWeight: 500,
        }}>
          Vlna je aktivní — nastavení nelze měnit
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassInput label="Název vlny" value={form.name} onChange={e => set('name', e.target.value)} disabled={locked} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Sada šablon</label>
          <select className="glass-input" value={form.template_set_id} onChange={e => set('template_set_id', e.target.value)} disabled={locked}>
            <option value="">— Bez šablon —</option>
            {(templateSets ?? []).map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Obchodník (Reply-To)</label>
          <select className="glass-input" value={form.salesman_id} onChange={e => set('salesman_id', e.target.value)} disabled={locked}>
            <option value="">— Vyberte obchodníka —</option>
            {(salesmen ?? []).filter(s => s.is_active !== false).map(s => (
              <option key={s.id} value={s.id}>{s.name} · {s.email}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Odesílací účet (FROM)</label>
          <select className="glass-input" value={form.outreach_account_id} onChange={e => set('outreach_account_id', e.target.value)} disabled={locked}>
            <option value="">— Vyberte odesílací email —</option>
            {(outreachAccounts ?? []).map(a => (
              <option key={a.id} value={a.id}>{a.email_address}</option>
            ))}
          </select>
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_dummy}
              onChange={e => set('is_dummy', e.target.checked)}
              disabled={locked}
              style={{ width: 14, height: 14, accentColor: 'var(--green)' }}
            />
            <span style={{ ...LABEL, marginBottom: 0 }}>Testovací vlna</span>
          </label>
          {form.is_dummy && (
            <div style={{ marginTop: 10 }}>
              <GlassInput
                label="Dummy příjemce (testovací email)"
                placeholder="test@firma.cz"
                value={form.dummy_email}
                onChange={e => set('dummy_email', e.target.value)}
                disabled={locked}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          )}
        </div>

        {!locked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlassButton variant="primary" onClick={handleSave} disabled={updateWave.isPending} style={{ alignSelf: 'flex-start' }}>
              {updateWave.isPending ? 'Ukládám…' : 'Uložit změny'}
            </GlassButton>
            {isDirty && (
              <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 500 }}>Neuložené změny</span>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
