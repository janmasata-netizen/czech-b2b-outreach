import { useState } from 'react';
import { Phone, Linkedin, MessageCircle, Check, X } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { useUpdateContact } from '@/hooks/useContacts';
import type { Contact } from '@/types/database';
import { toast } from 'sonner';

interface ContactMethodsCardProps {
  contacts: Contact[];
}

function InlineEdit({ value, field, contactId, companyId, icon: Icon, placeholder, color }: {
  value: string | null | undefined;
  field: 'phone' | 'linkedin' | 'other_contact';
  contactId: string;
  companyId: string;
  icon: React.ElementType;
  placeholder: string;
  color: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const update = useUpdateContact();

  async function save() {
    try {
      await update.mutateAsync({ id: contactId, companyId, updates: { [field]: val || null } });
      setEditing(false);
    } catch {
      toast.error('Chyba při ukládání', { duration: 8000 });
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon size={13} style={{ color, flexShrink: 0 }} />
        <input
          className="glass-input"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder={placeholder}
          autoFocus
          style={{ flex: 1, padding: '3px 8px', fontSize: 12 }}
        />
        <button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}>
          <Check size={14} />
        </button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        padding: '4px 0', fontSize: 12, color: value ? 'var(--text)' : 'var(--text-muted)',
      }}
    >
      <Icon size={13} style={{ color, flexShrink: 0 }} />
      {value || placeholder}
    </div>
  );
}

export default function ContactMethodsCard({ contacts }: ContactMethodsCardProps) {
  if (!contacts.length) return null;

  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Kontaktní údaje</h3>
      {contacts.map(contact => (
        <div key={contact.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 6 }}>
            {contact.full_name ?? 'Bez jména'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <InlineEdit value={contact.phone} field="phone" contactId={contact.id} companyId={contact.company_id} icon={Phone} placeholder="+ telefon" color="#fb923c" />
            <InlineEdit value={contact.linkedin} field="linkedin" contactId={contact.id} companyId={contact.company_id} icon={Linkedin} placeholder="+ LinkedIn" color="#22d3ee" />
            <InlineEdit value={contact.other_contact} field="other_contact" contactId={contact.id} companyId={contact.company_id} icon={MessageCircle} placeholder="+ jiný kontakt" color="#a78bfa" />
          </div>
        </div>
      ))}
    </GlassCard>
  );
}
