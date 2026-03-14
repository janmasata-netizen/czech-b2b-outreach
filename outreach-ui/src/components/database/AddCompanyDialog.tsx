import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { useCreateCompany } from '@/hooks/useCompanies';
import { useCreateContact } from '@/hooks/useContacts';
import { useTeams } from '@/hooks/useLeads';
import { toast } from 'sonner';

interface AddCompanyDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddCompanyDialog({ open, onClose }: AddCompanyDialogProps) {
  const { t } = useTranslation();
  const { data: teams } = useTeams();
  const createCompany = useCreateCompany();
  const createContact = useCreateContact();

  const [form, setForm] = useState({
    company_name: '',
    ico: '',
    website: '',
    domain: '',
    contact_name: '',
    contact_role: '',
    team_id: '',
  });

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function extractDomain(website: string): string {
    if (!website) return '';
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    }
  }

  async function handleSubmit(e?: FormEvent | React.MouseEvent) {
    e?.preventDefault();

    if (!form.company_name.trim()) {
      toast.error(t('database.enterCompanyName'));
      return;
    }
    if (form.ico && !/^\d{8}$/.test(form.ico)) {
      toast.error(t('addLeadDialog.icoMustBe8'));
      return;
    }

    const team_id = form.team_id || (teams && teams.length > 0 ? teams[0].id : undefined);
    if (!team_id) {
      toast.error('Nejdříve vytvořte tým');
      return;
    }

    try {
      const domain = form.domain.trim() || extractDomain(form.website);
      const company = await createCompany.mutateAsync({
        company_name: form.company_name.trim(),
        ico: form.ico.trim() || null,
        website: form.website.trim() || null,
        domain: domain || null,
        master_status: 'active',
        team_id,
      });

      // If contact name provided, create a contact linked to this company
      if (form.contact_name.trim() && company?.id) {
        await createContact.mutateAsync({
          company_id: company.id,
          full_name: form.contact_name.trim(),
          role: form.contact_role.trim() || null,
        });
      }

      toast.success('Firma přidána do databáze');
      setForm({ company_name: '', ico: '', website: '', domain: '', contact_name: '', contact_role: '', team_id: '' });
      onClose();
    } catch {
      toast.error('Chyba při přidávání firmy');
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Přidat firmu"
      width={480}
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>{t('common.cancel')}</GlassButton>
          <GlassButton variant="primary" onClick={e => handleSubmit(e)} disabled={createCompany.isPending}>
            {createCompany.isPending ? 'Ukládám…' : 'Přidat firmu'}
          </GlassButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <GlassInput
          label="Název firmy"
          placeholder="Firma s.r.o."
          value={form.company_name}
          onChange={e => set('company_name', e.target.value)}
          required
        />
        <GlassInput
          label="IČO"
          placeholder="12345678"
          value={form.ico}
          onChange={e => set('ico', e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        <GlassInput
          label="Web"
          placeholder="www.firma.cz"
          value={form.website}
          onChange={e => set('website', e.target.value)}
        />
        <GlassInput
          label="Doména"
          placeholder="firma.cz"
          value={form.domain}
          onChange={e => set('domain', e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Kontaktní osoba (volitelné)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <GlassInput
              label="Jméno"
              placeholder="Jan Novák"
              value={form.contact_name}
              onChange={e => set('contact_name', e.target.value)}
            />
            <GlassInput
              label="Role"
              placeholder="jednatel, zaměstnanec…"
              value={form.contact_role}
              onChange={e => set('contact_role', e.target.value)}
            />
          </div>
        </div>

        {teams && teams.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>Tým</label>
            <select
              className="glass-input"
              value={form.team_id}
              onChange={e => set('team_id', e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13 }}
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </form>
    </GlassModal>
  );
}
