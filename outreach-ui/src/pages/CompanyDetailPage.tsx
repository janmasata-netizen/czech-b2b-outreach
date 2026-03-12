import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCompany, useUpdateCompany } from '@/hooks/useCompanies';
import { useCreateContact, useUpdateContact, useDeleteContact } from '@/hooks/useContacts';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassModal from '@/components/glass/GlassModal';
import GlassInput from '@/components/glass/GlassInput';
import GlassCard from '@/components/glass/GlassCard';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import CompanyTagsCard from '@/components/database/CompanyTagsCard';
import MasterStatusBadge from '@/components/database/MasterStatusBadge';
import Breadcrumb from '@/components/shared/Breadcrumb';
import { Phone, Linkedin, MessageCircle, Mail, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Contact, EmailCandidate } from '@/types/database';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company, isLoading, error } = useCompany(id);
  const updateCompany = useUpdateCompany();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ company_name: '', ico: '', website: '', domain: '' });
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ full_name: '', role: '', phone: '', linkedin: '', notes: '' });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  if (isLoading) return <LoadingSkeleton />;
  if (error || !company) return <EmptyState icon="◈" title="Firma nenalezena" action={<GlassButton onClick={() => navigate('/databaze')}>← Zpět na databázi</GlassButton>} />;

  function openEdit() {
    setEditForm({
      company_name: company!.company_name ?? '',
      ico: company!.ico ?? '',
      website: company!.website ?? '',
      domain: company!.domain ?? '',
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!editForm.company_name) { toast.error('Zadejte název firmy', { duration: 8000 }); return; }
    try {
      await updateCompany.mutateAsync({
        id: company!.id,
        updates: {
          company_name: editForm.company_name || undefined,
          ico: editForm.ico || undefined,
          website: editForm.website || undefined,
          domain: editForm.domain || undefined,
        },
      });
      toast.success('Firma aktualizována');
      setEditing(false);
    } catch {
      toast.error('Chyba při ukládání', { duration: 8000 });
    }
  }

  function openAddContact() {
    setContactForm({ full_name: '', role: '', phone: '', linkedin: '', notes: '' });
    setEditingContactId(null);
    setShowAddContact(true);
  }

  function openEditContact(contact: Contact) {
    setContactForm({
      full_name: contact.full_name ?? '',
      role: contact.role ?? '',
      phone: contact.phone ?? '',
      linkedin: contact.linkedin ?? '',
      notes: contact.notes ?? '',
    });
    setEditingContactId(contact.id);
    setShowAddContact(true);
  }

  async function handleSaveContact() {
    if (!contactForm.full_name) { toast.error('Zadejte jméno kontaktu', { duration: 8000 }); return; }
    try {
      if (editingContactId) {
        await updateContact.mutateAsync({
          id: editingContactId,
          companyId: company!.id,
          updates: {
            full_name: contactForm.full_name,
            role: contactForm.role || null,
            phone: contactForm.phone || null,
            linkedin: contactForm.linkedin || null,
            notes: contactForm.notes || null,
          },
        });
        toast.success('Kontakt aktualizován');
      } else {
        await createContact.mutateAsync({
          company_id: company!.id,
          full_name: contactForm.full_name,
          role: contactForm.role || null,
          phone: contactForm.phone || null,
          linkedin: contactForm.linkedin || null,
          notes: contactForm.notes || null,
        });
        toast.success('Kontakt přidán');
      }
      setShowAddContact(false);
    } catch {
      toast.error('Chyba při ukládání kontaktu', { duration: 8000 });
    }
  }

  async function handleDeleteContact(contactId: string) {
    if (!confirm('Opravdu smazat tento kontakt?')) return;
    try {
      await deleteContact.mutateAsync({ id: contactId, companyId: company!.id });
      toast.success('Kontakt smazán');
    } catch {
      toast.error('Chyba při mazání kontaktu', { duration: 8000 });
    }
  }

  const contacts = company.contacts ?? [];
  const leads = company.leads ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Breadcrumb items={[
        { label: 'Databáze', to: '/databaze' },
        { label: company.company_name ?? 'Firma' },
      ]} />
      <PageHeader
        title={company.company_name ?? 'Firma'}
        subtitle={company.ico ? `IČO: ${company.ico}` : undefined}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <MasterStatusBadge status={company.master_status ?? 'active'} />
            <GlassButton size="sm" variant="secondary" onClick={openEdit}>Upravit</GlassButton>
            <GlassButton variant="secondary" onClick={() => navigate('/databaze')}>← Zpět</GlassButton>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Company Info */}
          <GlassCard padding={20}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Informace o firmě</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <InfoRow label="Název" value={company.company_name} />
              <InfoRow label="IČO" value={company.ico} mono />
              <InfoRow label="Web" value={company.website} link />
              <InfoRow label="Doména" value={company.domain} mono />
            </div>
          </GlassCard>

          <CompanyTagsCard companyId={company.id} />

          {/* Contacts */}
          <GlassCard padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Kontakty ({contacts.length})</h3>
              <GlassButton size="sm" variant="secondary" onClick={openAddContact}>
                <Plus size={13} /> Přidat
              </GlassButton>
            </div>
            {!contacts.length ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Žádné kontakty</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {contacts.map((contact: Contact & { email_candidates?: EmailCandidate[] }) => {
                  const emails = contact.email_candidates ?? [];
                  return (
                    <div key={contact.id} style={{ padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{contact.full_name ?? '—'}</div>
                          {contact.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{contact.notes}</div>}
                          {contact.salutation && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>{contact.salutation}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEditContact(contact)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDeleteContact(contact.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                        {contact.phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fb923c' }}>
                            <Phone size={12} /> {contact.phone}
                          </span>
                        )}
                        {contact.linkedin && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22d3ee' }}>
                            <Linkedin size={12} /> LinkedIn
                          </span>
                        )}
                        {contact.other_contact && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a78bfa' }}>
                            <MessageCircle size={12} /> {contact.other_contact}
                          </span>
                        )}
                        {emails.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}>
                            <Mail size={12} /> {emails.length} email{emails.length > 1 ? 'ů' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email outreach / linked leads */}
          <GlassCard padding={20}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Email outreach</h3>
            {!leads.length ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Žádné leady propojeny</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leads.map(lead => (
                  <Link
                    key={lead.id}
                    to={`/leady/${lead.id}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8,
                      border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.company_name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{lead.domain ?? '—'}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 4,
                      background: lead.status === 'ready' ? 'rgba(62,207,142,0.1)' : 'rgba(82,82,91,0.15)',
                      color: lead.status === 'ready' ? 'var(--green)' : 'var(--text-muted)',
                    }}>
                      {lead.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Edit company modal */}
      <GlassModal
        open={editing}
        onClose={() => setEditing(false)}
        title="Upravit firmu"
        width={480}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setEditing(false)}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSaveEdit} disabled={updateCompany.isPending}>
              {updateCompany.isPending ? 'Ukládám…' : 'Uložit'}
            </GlassButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassInput label="Název firmy" value={editForm.company_name} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))} required />
          <GlassInput label="IČO" value={editForm.ico} onChange={e => setEditForm(f => ({ ...f, ico: e.target.value }))} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
          <GlassInput label="Web" placeholder="www.firma.cz" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
          <GlassInput label="Doména" placeholder="firma.cz" value={editForm.domain} onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
        </div>
      </GlassModal>

      {/* Add/edit contact modal */}
      <GlassModal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        title={editingContactId ? 'Upravit kontakt' : 'Přidat kontakt'}
        width={480}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setShowAddContact(false)}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSaveContact} disabled={createContact.isPending || updateContact.isPending}>
              {(createContact.isPending || updateContact.isPending) ? 'Ukládám…' : 'Uložit'}
            </GlassButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassInput label="Jméno" value={contactForm.full_name} onChange={e => setContactForm(f => ({ ...f, full_name: e.target.value }))} required />
          <GlassInput label="Role" placeholder="jednatel, zaměstnanec…" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} />
          <GlassInput label="Telefon" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
          <GlassInput label="LinkedIn" value={contactForm.linkedin} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} />
          <GlassInput label="Poznámky" placeholder="volný text…" value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </GlassModal>
    </div>
  );
}

function InfoRow({ label, value, mono, link }: { label: string; value: string | null | undefined; mono?: boolean; link?: boolean }) {
  const display = value || '—';
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 70 }}>{label}</span>
      {link && value ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>{display}</a>
      ) : (
        <span style={{ color: 'var(--text)', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, fontSize: mono ? 12 : undefined }}>{display}</span>
      )}
    </div>
  );
}
