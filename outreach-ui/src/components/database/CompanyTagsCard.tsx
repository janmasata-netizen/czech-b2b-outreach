import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import TagBadge from './TagBadge';
import { useTags, useCompanyTags, useAddTagToCompany, useRemoveTagFromCompany } from '@/hooks/useTags';
import { isSystemTag } from '@/lib/constants';
import { toast } from 'sonner';

export default function CompanyTagsCard({ companyId }: { companyId: string }) {
  const { data: allTags = [] } = useTags();
  const { data: companyTags = [] } = useCompanyTags(companyId);
  const addTag = useAddTagToCompany();
  const removeTag = useRemoveTagFromCompany();
  const [showPicker, setShowPicker] = useState(false);

  const assignedTagIds = companyTags.map(ct => ct.tag_id);
  const availableTags = allTags.filter(t => !assignedTagIds.includes(t.id));

  async function handleAdd(tagId: string, tagName: string) {
    try {
      await addTag.mutateAsync({ companyId, tagId, tagName });
      setShowPicker(false);
    } catch {
      toast.error('Chyba při přidávání štítku', { duration: 8000 });
    }
  }

  async function handleRemove(tagId: string, tagName: string) {
    try {
      await removeTag.mutateAsync({ companyId, tagId, tagName });
    } catch {
      toast.error('Chyba při odebírání štítku', { duration: 8000 });
    }
  }

  return (
    <GlassCard padding={20}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Štítky</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {companyTags.map(ct => (
          <TagBadge
            key={ct.id}
            name={ct.tag?.name ?? ''}
            color={ct.tag?.color ?? '#6b7280'}
            onRemove={isSystemTag(ct.tag?.name ?? '') ? undefined : () => handleRemove(ct.tag_id, ct.tag?.name ?? '')}
          />
        ))}

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowPicker(v => !v)}
            style={{
              background: 'none', border: '1px dashed var(--border)', borderRadius: 10,
              padding: '2px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
              transition: 'border-color 0.15s',
            }}
          >
            + Přidat štítek
          </button>
          {showPicker && availableTags.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAdd(tag.id, tag.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text)', fontSize: 12, borderRadius: 4, textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
