import { useState } from 'react';
import { X } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import { useTags, useCreateTag, useDeleteTag } from '@/hooks/useTags';
import { toast } from 'sonner';

const PRESET_COLORS = [
  '#ef4444', '#fb923c', '#fbbf24', '#3ecf8e',
  '#22d3ee', '#6c8cff', '#a78bfa', '#6b7280',
];

export default function TagManager({ teamId }: { teamId?: string }) {
  const { data: tags = [] } = useTags(teamId);
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await createTag.mutateAsync({ name: name.trim(), color, team_id: teamId ?? null });
      setName('');
      toast.success('Štítek vytvořen');
    } catch {
      toast.error('Chyba při vytváření štítku');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTag.mutateAsync(id);
      toast.success('Štítek smazán');
    } catch {
      toast.error('Chyba při mazání štítku');
    }
  }

  return (
    <GlassCard padding={16}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Správa štítků</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({tags.length})</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Existing tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map(tag => (
              <span
                key={tag.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 10, fontSize: 12,
                  background: `${tag.color}22`, border: `1px solid ${tag.color}55`, color: tag.color,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color }} />
                {tag.name}
                <button
                  onClick={() => handleDelete(tag.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: tag.color, display: 'flex', opacity: 0.6,
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>

          {/* New tag form */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="glass-input"
              placeholder="Název štítku"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                />
              ))}
            </div>
            <GlassButton size="sm" variant="primary" onClick={handleCreate} disabled={!name.trim() || createTag.isPending}>
              +
            </GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
