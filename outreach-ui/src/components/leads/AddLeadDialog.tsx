import { useState, type FormEvent } from 'react';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { useTeams, useCreateLeadWithEmail } from '@/hooks/useLeads';
import { toast } from 'sonner';
import { checkDuplicates, extractDomain, formatMatchMessage } from '@/lib/dedup';

interface AddLeadDialogProps {
  open: boolean;
  onClose: () => void;
}

interface CustomFieldRow {
  key: string;
  value: string;
}

export default function AddLeadDialog({ open, onClose }: AddLeadDialogProps) {
  const { data: teams } = useTeams();
  const createLead = useCreateLeadWithEmail();
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    ico: '',
    website: '',
    contact_name: '',
    email: '',
    team_id: '',
  });
  const [customFields, setCustomFields] = useState<CustomFieldRow[]>([]);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function addCustomField() {
    setCustomFields(f => [...f, { key: '', value: '' }]);
  }

  function updateCustomField(index: number, field: 'key' | 'value', val: string) {
    setCustomFields(f => f.map((r, i) => i === index ? { ...r, [field]: val } : r));
  }

  function removeCustomField(index: number) {
    setCustomFields(f => f.filter((_, i) => i !== index));
  }

  function buildCustomFieldsObj(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const row of customFields) {
      const k = row.key.trim();
      const v = row.value.trim();
      if (k && v) obj[k] = v;
    }
    return obj;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.contact_name.trim()) {
      toast.error('Zadejte celé jméno kontaktní osoby');
      return;
    }
    if (!form.email.trim()) {
      toast.error('Zadejte e-mailovou adresu');
      return;
    }
    if (!form.company_name.trim()) {
      toast.error('Zadejte název firmy');
      return;
    }
    if (form.ico && !/^\d{8}$/.test(form.ico)) {
      toast.error('IČO musí mít přesně 8 číslic');
      return;
    }

    const team_id = form.team_id || teams?.[0]?.id || '';
    if (!team_id) {
      toast.error('Nejprve vytvořte tým v nastavení');
      return;
    }

    // Pre-flight dedup check
    try {
      setChecking(true);
      const domain = extractDomain(form.website);
      const result = await checkDuplicates([{
        ico: form.ico || undefined,
        domain: domain || undefined,
        email: form.email || undefined,
        company_name: form.company_name || undefined,
      }]);
      if (result.duplicates.length > 0) {
        toast.error(formatMatchMessage(result.duplicates[0]));
        return;
      }
    } catch (err) {
      console.error('Dedup check failed:', err);
      toast.error('Kontrola duplicit selhala — zkuste to znovu');
      return;
    } finally {
      setChecking(false);
    }

    try {
      const cf = buildCustomFieldsObj();
      await createLead.mutateAsync({
        company_name: form.company_name,
        ico: form.ico,
        website: form.website,
        contact_name: form.contact_name,
        email: form.email,
        team_id,
        custom_fields: Object.keys(cf).length > 0 ? cf : undefined,
      });
      toast.success('Lead přidán a připraven k odeslání');
      setForm({ company_name: '', ico: '', website: '', contact_name: '', email: '', team_id: '' });
      setCustomFields([]);
      onClose();
    } catch {
      toast.error('Chyba při přidávání leadu');
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Přidat nový lead"
      width={480}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={e => handleSubmit(e as any)} disabled={createLead.isPending || checking}>
            {checking ? 'Kontroluji…' : createLead.isPending ? 'Ukládám…' : 'Přidat lead'}
          </GlassButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassInput
          label="Celé jméno"
          placeholder="Jan Novák"
          value={form.contact_name}
          onChange={e => set('contact_name', e.target.value)}
        />
        <GlassInput
          label="E-mail"
          placeholder="jan.novak@firma.cz"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          type="email"
        />
        <GlassInput
          label="Název firmy"
          placeholder="Firma s.r.o."
          value={form.company_name}
          onChange={e => set('company_name', e.target.value)}
        />
        <GlassInput
          label="Web"
          placeholder="www.firma.cz"
          value={form.website}
          onChange={e => set('website', e.target.value)}
        />
        <GlassInput
          label="IČO"
          placeholder="12345678"
          value={form.ico}
          onChange={e => set('ico', e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />

        {teams && teams.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>Tým</label>
            <select className="glass-input" value={form.team_id} onChange={e => set('team_id', e.target.value)}>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Custom fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>Vlastní pole</label>
            <button
              type="button"
              onClick={addCustomField}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, padding: '2px 8px',
              }}
            >
              + Přidat pole
            </button>
          </div>
          {customFields.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="glass-input"
                placeholder="klíč"
                value={row.key}
                onChange={e => updateCustomField(i, 'key', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                style={{ flex: 1, height: 32, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <input
                className="glass-input"
                placeholder="hodnota"
                value={row.value}
                onChange={e => updateCustomField(i, 'value', e.target.value)}
                style={{ flex: 2, height: 32, fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => removeCustomField(i)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 16, padding: '0 4px',
                }}
              >x</button>
            </div>
          ))}
        </div>
      </form>
    </GlassModal>
  );
}
