import { useState } from 'react';
import { Phone, Linkedin, MessageCircle, Check, X } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { useUpdateJednatelContact } from '@/hooks/useMasterLeads';
import type { Jednatel } from '@/types/database';
import { toast } from 'sonner';

interface ContactMethodsCardProps {
  jednatels: Jednatel[];
}

function InlineEdit({ value, field, jednatelId, icon: Icon, placeholder, color }: {
  value: string | null | undefined;
  field: 'phone' | 'linkedin' | 'other_contact';
  jednatelId: string;
  icon: React.ElementType;
  placeholder: string;
  color: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const update = useUpdateJednatelContact();

  async function save() {
    try {
      await update.mutateAsync({ id: jednatelId, updates: { [field]: val || null } });
      setEditing(false);
    } catch {
      toast.error('Chyba při ukládání');
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

export default function ContactMethodsCard({ jednatels }: ContactMethodsCardProps) {
  if (!jednatels.length) return null;

  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Kontaktní údaje</h3>
      {jednatels.map(jed => (
        <div key={jed.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 6 }}>
            {jed.full_name ?? 'Bez jména'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <InlineEdit value={jed.phone} field="phone" jednatelId={jed.id} icon={Phone} placeholder="+ telefon" color="#fb923c" />
            <InlineEdit value={jed.linkedin} field="linkedin" jednatelId={jed.id} icon={Linkedin} placeholder="+ LinkedIn" color="#22d3ee" />
            <InlineEdit value={jed.other_contact} field="other_contact" jednatelId={jed.id} icon={MessageCircle} placeholder="+ jiný kontakt" color="#a78bfa" />
          </div>
        </div>
      ))}
    </GlassCard>
  );
}
