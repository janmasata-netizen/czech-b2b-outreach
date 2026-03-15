import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { useTeams, useCreateLeadWithEmail } from '@/hooks/useLeads';
import { toast } from 'sonner';
import { checkDuplicates, extractDomain, formatMatchMessage } from '@/lib/dedup';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { LEAD_LANGUAGE_MAP } from '@/lib/constants';

import type { LeadLanguage } from '@/types/database';

interface AddLeadDialogProps {
  open: boolean;
  onClose: () => void;
}

interface CustomFieldRow {
  key: string;
  value: string;
}

export default function AddLeadDialog({ open, onClose }: AddLeadDialogProps) {
  const { t } = useTranslation();
  const { data: teams } = useTeams();
  const createLead = useCreateLeadWithEmail();
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    ico: '',
    website: '',
    contact_name: '',
    email: '',
    language: 'cs' as LeadLanguage,
  });
  const [selectedTeamId, setSelectedTeamId] = useState(teams?.[0]?.id ?? '');
  const [customFields, setCustomFields] = useState<CustomFieldRow[]>([]);
  const [enrichEmail, setEnrichEmail] = useState(true);

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

  async function handleSubmit(e?: FormEvent | React.MouseEvent) {
    e?.preventDefault();

    if (!form.contact_name.trim()) {
      toast.error(t('addLeadDialog.enterContactName'));
      return;
    }
    const hasEmail = !!form.email.trim();
    const canEnrich = enrichEmail && !hasEmail && (form.website.trim() || form.ico.trim());
    if (!hasEmail && !canEnrich) {
      toast.error(t('addLeadDialog.enterEmailOrEnrich'));
      return;
    }
    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error(t('addLeadDialog.invalidEmail'));
      return;
    }
    if (!form.company_name.trim()) {
      toast.error(t('addLeadDialog.enterCompanyName'));
      return;
    }
    if (form.ico && !/^\d{8}$/.test(form.ico)) {
      toast.error(t('addLeadDialog.icoMustBe8'));
      return;
    }

    // Resolve team
    const team_id = selectedTeamId || teams?.[0]?.id || '';
    if (!team_id) {
      toast.error(t('addLeadDialog.createTeamFirst'));
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
      toast.error(t('addLeadDialog.dedupFailed'));
      return;
    } finally {
      setChecking(false);
    }

    try {
      const cf = buildCustomFieldsObj();
      if (canEnrich) {
        // Call WF1 webhook for enrichment
        const payload: Record<string, string | null> = {
          company_name: form.company_name || form.contact_name || null,
          ico: form.ico || null,
          website: form.website || null,
          team_id,
          language: form.language,
        };
        if (form.contact_name) (payload as Record<string, string | null>).contact_name = form.contact_name;
        const res = await fetch(n8nWebhookUrl('lead-ingest'), {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          toast.error(t('addLeadDialog.duplicateExists'));
          return;
        }
        if (!res.ok) throw new Error(`WF1 error: ${res.status}`);
        toast.success(t('addLeadDialog.leadAddedEnriching'));
      } else {
        await createLead.mutateAsync({
          company_name: form.company_name,
          ico: form.ico,
          website: form.website,
          contact_name: form.contact_name,
          email: form.email,
          team_id,
          custom_fields: Object.keys(cf).length > 0 ? cf : undefined,
        });
        toast.success(t('addLeadDialog.leadAddedReady'));
      }
      setForm({ company_name: '', ico: '', website: '', contact_name: '', email: '', language: 'cs' });
      setCustomFields([]);
      onClose();
    } catch {
      toast.error(t('addLeadDialog.errorAdding'));
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('leads.addLead')}
      width={480}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>{t('common.cancel')}</GlassButton>
          <GlassButton variant="primary" onClick={e => handleSubmit(e)} disabled={createLead.isPending || checking}>
            {checking ? t('common.checking') : createLead.isPending ? t('common.saving') : t('leads.addLeadShort')}
          </GlassButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassInput
          label={t('addLeadDialog.fullName')}
          placeholder="Jan Novák"
          value={form.contact_name}
          onChange={e => set('contact_name', e.target.value)}
        />
        <GlassInput
          label={t('addLeadDialog.email')}
          placeholder="jan.novak@firma.cz"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          type="email"
        />
        <GlassInput
          label={t('addLeadDialog.companyName')}
          placeholder="Firma s.r.o."
          value={form.company_name}
          onChange={e => set('company_name', e.target.value)}
        />
        <GlassInput
          label={t('addLeadDialog.web')}
          placeholder="www.firma.cz"
          value={form.website}
          onChange={e => set('website', e.target.value)}
        />
        <GlassInput
          label={t('addLeadDialog.ico')}
          placeholder="12345678"
          value={form.ico}
          onChange={e => set('ico', e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />

        {/* Enrichment checkbox - shown when email is empty but website or ICO present */}
        {!form.email.trim() && (form.website.trim() || form.ico.trim()) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0' }}>
            <input
              type="checkbox"
              checked={enrichEmail}
              onChange={e => setEnrichEmail(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--green)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('addLeadDialog.startEmailSearch')}</span>
          </label>
        )}

        {teams && teams.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{t('leads.team')}</label>
            <select
              className="glass-input"
              style={{ height: 34, fontSize: 13 }}
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Language selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>Jazyk</label>
          <select className="glass-input" value={form.language} onChange={e => set('language', e.target.value)}>
            {Object.entries(LEAD_LANGUAGE_MAP).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Custom fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{t('addLeadDialog.customFields')}</label>
            <button
              type="button"
              onClick={addCustomField}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, padding: '2px 8px',
              }}
            >
              {t('addLeadDialog.addField')}
            </button>
          </div>
          {customFields.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="glass-input"
                placeholder={t('addLeadDialog.key')}
                value={row.key}
                onChange={e => updateCustomField(i, 'key', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                style={{ flex: 1, height: 32, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <input
                className="glass-input"
                placeholder={t('addLeadDialog.value')}
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
