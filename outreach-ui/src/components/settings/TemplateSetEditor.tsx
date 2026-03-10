import { useState, useRef, useCallback } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassModal from '@/components/glass/GlassModal';
import GlassInput from '@/components/glass/GlassInput';
import ConfirmDialog from '@/components/glass/ConfirmDialog';
import RichTextEditor from '@/components/shared/RichTextEditor';
import type { RichTextEditorRef } from '@/components/shared/RichTextEditor';
import {
  useTemplateSetsSettings,
  useUpsertTemplate,
  useDeleteTemplate,
  useCreateTemplateSet,
  useUpdateTemplateSet,
  useDeleteTemplateSet,
  useTeamsSettings,
  useReorderSequences,
} from '@/hooks/useSettings';
import { toast } from 'sonner';
import type { TemplateVariable, EmailTemplate } from '@/types/database';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' };
const MONO: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' };

/* ── Sequence Panel sub-component ─────────────────────── */
interface SequencePanelProps {
  seq: number;
  templateA: EmailTemplate | undefined;
  templateB: EmailTemplate | undefined;
  allVariables: TemplateVariable[];
  customVariables: TemplateVariable[];
  setId: string;
  onDelete: () => void;
  canDelete: boolean;
  displayNumber: number;
}

function SequencePanel({
  seq, templateA, templateB, allVariables, customVariables,
  setId, onDelete, canDelete, displayNumber,
}: SequencePanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: seq });
  const upsertTemplate = useUpsertTemplate();
  const [subject, setSubject] = useState(templateA?.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(templateA?.body_html ?? '');
  const [dirty, setDirty] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');

  // Re-sync state when templateA changes (e.g., after refetch)
  const lastTemplateId = useRef(templateA?.id);
  if (templateA?.id !== lastTemplateId.current) {
    lastTemplateId.current = templateA?.id;
    setSubject(templateA?.subject ?? '');
    setBodyHtml(templateA?.body_html ?? '');
    setDirty(false);
  }

  function handleSubjectChange(val: string) {
    setSubject(val);
    setDirty(true);
  }
  function handleBodyChange(html: string) {
    setBodyHtml(html);
    setDirty(true);
  }

  function insertVariable(varName: string) {
    const token = `{{${varName}}}`;
    if (activeField === 'subject') {
      const el = subjectRef.current;
      if (el) {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        const val = el.value;
        const newVal = val.slice(0, start) + token + val.slice(end);
        setSubject(newVal);
        setDirty(true);
        setTimeout(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); }, 0);
      }
    } else {
      editorRef.current?.insertVariable(varName);
    }
  }

  async function handleSave() {
    if (!subject.trim()) { toast.error('Zadejte předmět'); return; }
    try {
      // Upsert variant A
      await upsertTemplate.mutateAsync({
        ...(templateA?.id ? { id: templateA.id } : {}),
        subject, body_html: bodyHtml,
        sequence_number: seq, template_set_id: setId, variant: 'A',
      });
      // Upsert variant B (mirror)
      await upsertTemplate.mutateAsync({
        ...(templateB?.id ? { id: templateB.id } : {}),
        subject, body_html: bodyHtml,
        sequence_number: seq, template_set_id: setId, variant: 'B',
      });
      setDirty(false);
      toast.success(`Sekvence ${displayNumber} uložena`);
    } catch {
      toast.error('Chyba při ukládání');
    }
  }

  const subjectPreview = subject || '(bez předmětu)';

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={{
      borderRadius: 10, border: '1px solid var(--border)',
      background: 'rgba(62,207,142,0.03)',
      ...sortableStyle,
    }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', userSelect: 'none',
        }}
      >
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          title="Přetáhněte pro změnu pořadí"
          style={{
            cursor: 'grab', color: 'var(--text-muted)', fontSize: 16,
            lineHeight: 1, flexShrink: 0, padding: '0 2px',
            display: 'flex', alignItems: 'center',
          }}
        >&#x2630;</span>
        <span
          style={{
            fontSize: 11, ...MONO, fontWeight: 700, color: 'var(--green)',
            background: 'rgba(62,207,142,0.1)', padding: '2px 8px', borderRadius: 4,
            flexShrink: 0,
          }}>SEQ {displayNumber}</span>
        <span
          style={{
            flex: 1, fontSize: 13, color: subject ? 'var(--text)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontStyle: subject ? 'normal' : 'italic',
          }}>{subjectPreview}</span>
        {dirty && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Neuloženo</span>}
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Smazat sekvenci"
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14,
              padding: '0 6px', display: 'flex', alignItems: 'center', lineHeight: '22px',
            }}
          >x</button>
        )}
      </div>

      {/* Always-visible content */}
      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Subject */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Předmět e-mailu</label>
          <input
            ref={subjectRef}
            className="glass-input"
            autoComplete="one-time-code"
            value={subject}
            onChange={e => handleSubjectChange(e.target.value)}
            onFocus={() => setActiveField('subject')}
            placeholder="Nabídka pro {{company_name}}"
            style={{ ...MONO, fontSize: 13 }}
          />
        </div>

        {/* Variable insertion buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>
            Vložit do {activeField === 'subject' ? 'předmětu' : 'těla'}:
          </span>
          {allVariables.map(v => (
            <button
              key={v.name}
              onClick={() => insertVariable(v.name)}
              style={{
                background: customVariables.some(cv => cv.name === v.name) ? 'rgba(62,207,142,0.08)' : 'rgba(82,82,91,0.1)',
                border: `1px solid ${customVariables.some(cv => cv.name === v.name) ? 'rgba(62,207,142,0.25)' : 'var(--border)'}`,
                color: customVariables.some(cv => cv.name === v.name) ? '#3ECF8E' : 'var(--text-dim)',
                fontSize: 11, ...MONO, padding: '3px 8px',
                borderRadius: 4, cursor: 'pointer',
                fontWeight: customVariables.some(cv => cv.name === v.name) ? 600 : 400,
              }}
            >
              {`{{${v.name}}}`}
            </button>
          ))}
        </div>

        {/* Body editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>Tělo e-mailu</label>
          <RichTextEditor
            ref={editorRef}
            value={bodyHtml}
            onChange={handleBodyChange}
            variables={allVariables}
            placeholder="Dobrý den {{salutation}},..."
            minHeight={250}
          />
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={upsertTemplate.isPending || !dirty}
          >
            {upsertTemplate.isPending ? 'Ukládám...' : 'Uložit sekvenci'}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

/* ── Main editor component ────────────────────────────── */
export default function TemplateSetEditor() {
  const { data: teams } = useTeamsSettings();
  const teamId = teams?.[0]?.id;
  const { data: sets, isLoading } = useTemplateSetsSettings(teamId);
  const upsertTemplate = useUpsertTemplate();
  const deleteTemplate = useDeleteTemplate();
  const createTemplateSet = useCreateTemplateSet();
  const updateTemplateSet = useUpdateTemplateSet();
  const deleteTemplateSet = useDeleteTemplateSet();
  const reorderSequences = useReorderSequences();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [showNewSet, setShowNewSet] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteSeq, setConfirmDeleteSeq] = useState<number | null>(null);

  // Variable editing state
  const [newVarName, setNewVarName] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');

  const selectedSet = sets?.find(s => s.id === selectedSetId);
  const templates: EmailTemplate[] = selectedSet?.email_templates ?? [];
  const variables: TemplateVariable[] = selectedSet?.variables ?? [];

  // Get distinct sorted sequence numbers
  const seqNumbers = Array.from(new Set(templates.map((t: EmailTemplate) => t.sequence_number))).sort((a, b) => a - b);

  // Group templates by seq → variant
  const templatesBySeq = useCallback(() => {
    const map = new Map<number, { A?: EmailTemplate; B?: EmailTemplate }>();
    for (const t of templates) {
      const seq = t.sequence_number;
      const variant = (t.variant ?? t.ab_variant) as string;
      if (!map.has(seq)) map.set(seq, {});
      const entry = map.get(seq)!;
      if (variant === 'A') entry.A = t;
      else if (variant === 'B') entry.B = t;
    }
    return map;
  }, [templates])();

  // Combine custom + standard variables
  const allVariables: TemplateVariable[] = [
    ...variables,
    ...['company_name', 'salutation', 'first_name', 'last_name', 'domain', 'ico', 'full_name']
      .filter(name => !variables.some(v => v.name === name))
      .map(name => ({ name, label: name })),
  ];

  // ── Create set + 3 default sequences ──────────────────
  async function handleCreateSet() {
    if (!newSetName.trim() || !teamId) return;
    try {
      const data = await createTemplateSet.mutateAsync({ name: newSetName.trim(), team_id: teamId });
      // Auto-create 3 empty sequence pairs
      for (const seq of [1, 2, 3]) {
        for (const variant of ['A', 'B']) {
          await upsertTemplate.mutateAsync({
            template_set_id: data.id,
            sequence_number: seq,
            variant,
            subject: '',
            body_html: '',
          });
        }
      }
      setSelectedSetId(data.id);
      setNewSetName('');
      setShowNewSet(false);
      toast.success('Šablona vytvořena');
    } catch {
      toast.error('Chyba při vytváření šablony');
    }
  }

  // ── Delete set ────────────────────────────────────────
  async function handleDeleteSet() {
    if (!confirmDeleteId) return;
    try {
      await deleteTemplateSet.mutateAsync(confirmDeleteId);
      if (selectedSetId === confirmDeleteId) setSelectedSetId(null);
      toast.success('Šablona smazána');
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('foreign key') || msg.includes('violates')) {
        toast.error('Šablonu nelze smazat — je používána vlnou');
      } else {
        toast.error('Chyba při mazání šablony');
      }
    } finally {
      setConfirmDeleteId(null);
    }
  }

  // ── Add variable ──────────────────────────────────────
  async function handleAddVariable() {
    if (!selectedSetId || !newVarName.trim() || !newVarLabel.trim()) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newVarName)) {
      toast.error('Název proměnné: pouze písmena, číslice a podtržítko');
      return;
    }
    if (variables.some(v => v.name === newVarName)) {
      toast.error('Proměnná s tímto názvem již existuje');
      return;
    }
    const updated = [...variables, { name: newVarName.trim(), label: newVarLabel.trim() }];
    try {
      await updateTemplateSet.mutateAsync({ id: selectedSetId, variables: updated });
      setNewVarName('');
      setNewVarLabel('');
      toast.success('Proměnná přidána');
    } catch {
      toast.error('Chyba při ukládání proměnné');
    }
  }

  // ── Remove variable ───────────────────────────────────
  async function handleRemoveVariable(name: string) {
    if (!selectedSetId) return;
    const updated = variables.filter(v => v.name !== name);
    try {
      await updateTemplateSet.mutateAsync({ id: selectedSetId, variables: updated });
      toast.success('Proměnná odstraněna');
    } catch {
      toast.error('Chyba při odstraňování proměnné');
    }
  }

  // ── Add sequence ──────────────────────────────────────
  async function handleAddSequence() {
    if (!selectedSetId) return;
    const nextSeq = seqNumbers.length + 1;
    try {
      for (const variant of ['A', 'B']) {
        await upsertTemplate.mutateAsync({
          template_set_id: selectedSetId,
          sequence_number: nextSeq,
          variant,
          subject: '',
          body_html: '',
        });
      }
      toast.success(`Sekvence ${nextSeq} přidána`);
    } catch {
      toast.error('Chyba při přidávání sekvence');
    }
  }

  // ── Delete sequence with auto-renumber ───────────────
  async function handleDeleteSequence() {
    if (confirmDeleteSeq === null || !selectedSetId) return;
    const seq = confirmDeleteSeq;
    const pair = templatesBySeq.get(seq);
    try {
      if (pair?.A?.id) await deleteTemplate.mutateAsync(pair.A.id);
      if (pair?.B?.id) await deleteTemplate.mutateAsync(pair.B.id);

      // Auto-renumber remaining sequences to close gaps
      const remaining = seqNumbers.filter(s => s !== seq).sort((a, b) => a - b);
      if (remaining.length > 0) {
        await reorderSequences.mutateAsync({ setId: selectedSetId, order: remaining });
      }

      toast.success(`Sekvence smazána`);
    } catch {
      toast.error('Chyba při mazání sekvence');
    } finally {
      setConfirmDeleteSeq(null);
    }
  }

  // ── Drag-and-drop reorder ──────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedSetId) return;

    const oldIndex = seqNumbers.indexOf(active.id as number);
    const newIndex = seqNumbers.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    // Build new order: take seqNumbers, move item from oldIndex to newIndex
    const reordered = [...seqNumbers];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    try {
      await reorderSequences.mutateAsync({ setId: selectedSetId, order: reordered });
      toast.success('Pořadí sekvencí změněno');
    } catch {
      toast.error('Chyba při změně pořadí');
    }
  }

  // Czech pluralization for "sekvence/sekvencí"
  function seqLabel(n: number) {
    if (n === 1) return '1 sekvence';
    if (n >= 2 && n <= 4) return `${n} sekvence`;
    return `${n} sekvencí`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Šablony" actions={
        <GlassButton size="sm" variant="primary" onClick={() => setShowNewSet(true)}>+ Nová šablona</GlassButton>
      } />

      {/* ── Grid view: template set cards ── */}
      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Načítám...</p>
      ) : !sets?.length ? (
        <GlassCard padding={40}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Žádné šablony</p>
        </GlassCard>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {sets.map(s => {
            const seqCount = new Set((s.email_templates ?? []).map((t: EmailTemplate) => t.sequence_number)).size;
            return (
              <div
                key={s.id}
                onClick={() => setSelectedSetId(s.id)}
                style={{
                  position: 'relative',
                  padding: '16px 18px',
                  borderRadius: 10,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(62,207,142,0.4)';
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(62,207,142,0.04)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-subtle)';
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {seqLabel(seqCount)}
                </div>
                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id); }}
                  title="Smazat šablonu"
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13,
                    padding: '0 5px', lineHeight: '20px',
                    opacity: 0.5, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5'; }}
                >x</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Fullscreen modal: selected template set ── */}
      <GlassModal
        open={!!selectedSetId && !!selectedSet}
        onClose={() => setSelectedSetId(null)}
        title={selectedSet?.name ?? ''}
        fullscreen
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Variables section ── */}
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            background: 'rgba(62,207,142,0.04)', border: '1px solid rgba(62,207,142,0.15)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
              Proměnné
            </div>

            {/* Existing variables */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: variables.length > 0 ? 10 : 0 }}>
              {variables.map(v => (
                <span key={v.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 6, fontSize: 12,
                  background: 'rgba(62,207,142,0.1)', border: '1px solid rgba(62,207,142,0.25)',
                  color: 'var(--text)',
                }}>
                  <code style={{ ...MONO, color: '#3ECF8E', fontSize: 11 }}>{v.name}</code>
                  <span style={{ color: 'var(--text-muted)' }}>({v.label})</span>
                  <button
                    onClick={() => handleRemoveVariable(v.name)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0,
                    }}
                  >x</button>
                </span>
              ))}
            </div>

            {/* Standard auto-resolved fields info */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              Automatické: <code style={{ ...MONO, color: 'var(--text-dim)', fontSize: 10 }}>
                {'{{company_name}} {{ico}} {{domain}} {{first_name}} {{last_name}} {{salutation}} {{full_name}}'}
              </code>
            </div>

            {/* Add variable form */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ ...LABEL, fontSize: 11 }}>Název (klíč)</label>
                <input
                  className="glass-input"
                  value={newVarName}
                  onChange={e => setNewVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="mesto"
                  style={{ ...MONO, fontSize: 12, width: 120, height: 30 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ ...LABEL, fontSize: 11 }}>Popisek</label>
                <input
                  className="glass-input"
                  value={newVarLabel}
                  onChange={e => setNewVarLabel(e.target.value)}
                  placeholder="Město"
                  style={{ fontSize: 12, width: 140, height: 30 }}
                />
              </div>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={handleAddVariable}
                disabled={!newVarName || !newVarLabel}
                style={{ height: 30, fontSize: 11 }}
              >
                + Přidat
              </GlassButton>
            </div>
          </div>

          {/* ── Sequence panels (always expanded) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Sekvence</div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={seqNumbers} strategy={verticalListSortingStrategy}>
                {seqNumbers.map((seq, idx) => {
                  const pair = templatesBySeq.get(seq);
                  return (
                    <SequencePanel
                      key={`${selectedSetId}-${seq}`}
                      seq={seq}
                      displayNumber={idx + 1}
                      templateA={pair?.A}
                      templateB={pair?.B}
                      allVariables={allVariables}
                      customVariables={variables}
                      setId={selectedSetId!}
                      onDelete={() => setConfirmDeleteSeq(seq)}
                      canDelete={seqNumbers.length > 1}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>

            {seqNumbers.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                Žádné sekvence
              </p>
            )}

            <GlassButton
              size="sm"
              variant="secondary"
              onClick={handleAddSequence}
              disabled={upsertTemplate.isPending}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              + Přidat sekvenci
            </GlassButton>
          </div>
        </div>
      </GlassModal>

      {/* ── New Set Dialog ── */}
      <GlassModal
        open={showNewSet}
        onClose={() => { setShowNewSet(false); setNewSetName(''); }}
        title="Nová šablona"
        width={400}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => { setShowNewSet(false); setNewSetName(''); }}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleCreateSet} disabled={!newSetName.trim() || createTemplateSet.isPending}>
              {createTemplateSet.isPending ? 'Vytvářím...' : 'Vytvořit'}
            </GlassButton>
          </>
        }
      >
        <GlassInput
          label="Název šablony"
          placeholder="Nabídka webu"
          value={newSetName}
          onChange={e => setNewSetName(e.target.value)}
          autoFocus
        />
      </GlassModal>

      {/* ── Confirm Delete Set ── */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDeleteSet}
        title="Smazat šablonu"
        confirmLabel="Smazat"
        variant="danger"
        loading={deleteTemplateSet.isPending}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Smazat šablonu a všechny její sekvence? Tato akce je nevratná.
        </div>
      </ConfirmDialog>

      {/* ── Confirm Delete Sequence ── */}
      <ConfirmDialog
        open={confirmDeleteSeq !== null}
        onClose={() => setConfirmDeleteSeq(null)}
        onConfirm={handleDeleteSequence}
        title={`Smazat sekvenci ${confirmDeleteSeq}`}
        confirmLabel="Smazat"
        variant="danger"
        loading={deleteTemplate.isPending}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Smazat sekvenci {confirmDeleteSeq} (obě varianty A/B)? Tato akce je nevratná.
        </div>
      </ConfirmDialog>
    </div>
  );
}
