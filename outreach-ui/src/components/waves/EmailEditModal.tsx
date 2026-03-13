import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import GlassModal from '@/components/glass/GlassModal';
import GlassInput from '@/components/glass/GlassInput';
import GlassButton from '@/components/glass/GlassButton';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { useUpdateEmailQueue } from '@/hooks/useWaves';
import { toast } from 'sonner';
import type { EmailQueue, TemplateVariable } from '@/types/database';

interface EmailEditModalProps {
  item: EmailQueue | null;
  waveId: string;
  onClose: () => void;
  variables?: TemplateVariable[];
}

export default function EmailEditModal({ item, waveId, onClose, variables }: EmailEditModalProps) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const prevItemId = useRef<string | null>(null);
  const updateQueue = useUpdateEmailQueue(waveId);

  useEffect(() => {
    if (item && item.id !== prevItemId.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubject(item.subject_rendered ?? '');
      setBodyHtml(item.body_rendered ?? '');
      prevItemId.current = item.id;
    }
    if (!item) {
      prevItemId.current = null;
    }
  }, [item]);

  async function handleSave() {
    if (!item) return;
    try {
      await updateQueue.mutateAsync({ id: item.id, subject_rendered: subject, body_rendered: bodyHtml });
      toast.success('Email aktualizován');
      onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error('Chyba: ' + (e?.message ?? 'neznámá chyba'), { duration: 8000 });
    }
  }

  const allVars = [
    ...(variables ?? []),
    // Standard auto-resolved variables shown as fallback
    ...(['company_name', 'salutation', 'first_name', 'last_name', 'domain', 'ico', 'full_name']
      .filter(name => !(variables ?? []).some(v => v.name === name))
      .map(name => ({ name, label: name }))),
  ];

  return (
    <GlassModal
      open={!!item}
      onClose={onClose}
      title={`Upravit email — SEQ${item?.sequence_number ?? ''}`}
      fullscreen
      footer={
        <>
          <GlassButton variant="secondary" onClick={onClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" onClick={handleSave} disabled={updateQueue.isPending}>
            {updateQueue.isPending ? 'Ukládám...' : 'Uložit'}
          </GlassButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Subject */}
        <GlassInput
          label="Předmět"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
        />

        {/* WYSIWYG body editor */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 5 }}>Tělo e-mailu</div>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            minHeight={400}
          />
        </div>

        {/* Variable hints */}
        {allVars.length > 0 && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 11,
            background: 'rgba(62,207,142,0.05)', border: '1px solid rgba(62,207,142,0.15)',
            color: 'var(--text-muted)',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-dim)' }}>Proměnné: </span>
            {allVars.map((v, i) => (
              <span key={v.name}>
                <code style={{ color: '#3ECF8E', fontSize: 11 }}>{`{{${v.name}}}`}</code>
                <span style={{ color: 'var(--text-muted)' }}> ({v.label})</span>
                {i < allVars.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}
      </div>
    </GlassModal>
  );
}
