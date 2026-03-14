import { useState, useEffect, useRef } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import { useUpdateWave, useTemplateSets, useFromEmailSuggestions } from '@/hooks/useWaves';
import { useSalesmen } from '@/hooks/useSettings';
import { useCreateWavePreset } from '@/hooks/useWavePresets';
import type { WaveAnalytics, Wave } from '@/types/database';
import { toast } from 'sonner';

interface WaveConfigFormProps {
  wave: WaveAnalytics;
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };

export default function WaveConfigForm({ wave }: WaveConfigFormProps) {
  const { data: templateSets } = useTemplateSets(wave.team_id ?? undefined);
  const { data: salesmen } = useSalesmen(wave.team_id ?? undefined);
  const { data: emailSuggestions } = useFromEmailSuggestions();
  const updateWave = useUpdateWave();
  const createPreset = useCreateWavePreset();
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');

  const [form, setForm] = useState({
    name: wave.name ?? '',
    template_set_id: wave.template_set_id ?? '',
    salesman_id: wave.salesman_id ?? '',
    from_email: wave.from_email ?? '',
    is_dummy: Boolean(wave.is_dummy),
    dummy_email: wave.dummy_email ?? '',
  });

  useEffect(() => {
    setForm({
      name: wave.name ?? '',
      template_set_id: wave.template_set_id ?? '',
      salesman_id: wave.salesman_id ?? '',
      from_email: wave.from_email ?? '',
      is_dummy: Boolean(wave.is_dummy),
      dummy_email: wave.dummy_email ?? '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave.id, wave.template_set_id, wave.salesman_id, wave.from_email, wave.is_dummy, wave.dummy_email]);

  const savedForm = useRef(form);
  useEffect(() => {
    savedForm.current = {
      name: wave.name ?? '',
      template_set_id: wave.template_set_id ?? '',
      salesman_id: wave.salesman_id ?? '',
      from_email: wave.from_email ?? '',
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
          template_set_id: form.template_set_id || null,
          salesman_id: form.salesman_id || null,
          from_email: form.from_email || null,
          is_dummy: form.is_dummy,
          dummy_email: form.is_dummy ? (form.dummy_email || null) : null,
        } as Partial<Wave>,
      });
      savedForm.current = { ...form };
      toast.success('Vlna uložena');
    } catch {
      toast.error('Chyba při ukládání vlny', { duration: 8000 });
    }
  }

  const hasConfigValues = !!(form.template_set_id || form.from_email || form.salesman_id);

  async function handleSavePreset() {
    if (!presetName.trim() || !wave.team_id) return;
    try {
      await createPreset.mutateAsync({
        name: presetName.trim(),
        team_id: wave.team_id,
        template_set_id: form.template_set_id || null,
        from_email: form.from_email || null,
        salesman_id: form.salesman_id || null,
      });
      toast.success('Preset uložen');
      setPresetName('');
      setShowPresetModal(false);
    } catch {
      toast.error('Chyba při ukládání presetu', { duration: 8000 });
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
          <label style={LABEL}>Odesílací email (FROM)</label>
          <input
            className="glass-input"
            list="from-email-suggestions"
            type="email"
            placeholder="outreach@firma.cz"
            value={form.from_email}
            onChange={e => set('from_email', e.target.value)}
            disabled={locked}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
          <datalist id="from-email-suggestions">
            {(emailSuggestions ?? []).map(email => (
              <option key={email} value={email} />
            ))}
          </datalist>
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

        {hasConfigValues && (
          <GlassButton variant="ghost" onClick={() => setShowPresetModal(true)} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
            💾 Uložit jako preset
          </GlassButton>
        )}
      </div>

      <GlassModal open={showPresetModal} onClose={() => setShowPresetModal(false)} title="Uložit preset" width={400}
        footer={<>
          <GlassButton variant="ghost" onClick={() => setShowPresetModal(false)}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={handleSavePreset} disabled={!presetName.trim() || createPreset.isPending}>
            {createPreset.isPending ? 'Ukládám…' : 'Uložit'}
          </GlassButton>
        </>}
      >
        <GlassInput label="Název presetu" placeholder="např. Hlavní outreach" value={presetName} onChange={e => setPresetName(e.target.value)} autoFocus />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Uloží aktuální šablonu, odesílací email a obchodníka jako znovupoužitelný preset.
        </p>
      </GlassModal>
    </GlassCard>
  );
}
