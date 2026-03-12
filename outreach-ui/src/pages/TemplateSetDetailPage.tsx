import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumb from '@/components/shared/Breadcrumb';
import GlassButton from '@/components/glass/GlassButton';

import ConfirmDialog from '@/components/glass/ConfirmDialog';
import RichTextEditor from '@/components/shared/RichTextEditor';
import type { RichTextEditorRef } from '@/components/shared/RichTextEditor';
import {
  useTemplateSetsSettings,
  useUpsertTemplate,
  useDeleteTemplate,

  useTeamsSettings,
  useReorderSequences,
} from '@/hooks/useSettings';
import { useAuthContext } from '@/components/AuthProvider';
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

const DEFAULT_VARIABLES: TemplateVariable[] = [
  { name: 'company_name', label: 'company_name', description: 'Název firmy (např. Alza.cz a.s.)' },
  { name: 'salutation', label: 'české oslovení', description: 'České formální oslovení s vokativem (např. Vážený pane Nováku) — funguje pouze pro česká jména' },
  { name: 'first_name', label: 'first_name', description: 'Křestní jméno jednatele (např. Jan)' },
  { name: 'last_name', label: 'last_name', description: 'Příjmení jednatele (např. Novák)' },
  { name: 'domain', label: 'domain', description: 'Doména firmy (např. alza.cz)' },
  { name: 'ico', label: 'ico', description: 'IČO firmy (např. 27082440)' },
  { name: 'full_name', label: 'full_name', description: 'Celé jméno jednatele (např. Jan Novák)' },
];

/* ── Sequence Panel sub-component ─────────────────────── */
interface SequencePanelProps {
  seq: number;
  templateA: EmailTemplate | undefined;
  templateB: EmailTemplate | undefined;
  allVariables: TemplateVariable[];
  setId: string;
  onDelete: () => void;
  canDelete: boolean;
  displayNumber: number;
}

function SequencePanel({
  seq, templateA, templateB, allVariables,
  setId, onDelete, canDelete, displayNumber,
}: SequencePanelProps) {
  const { t } = useTranslation();
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
    if (!subject.trim()) { toast.error(t('templates.enterSubject'), { duration: 8000 }); return; }
    try {
      await upsertTemplate.mutateAsync({
        ...(templateA?.id ? { id: templateA.id } : {}),
        subject, body_html: bodyHtml,
        sequence_number: seq, template_set_id: setId, variant: 'A',
      });
      await upsertTemplate.mutateAsync({
        ...(templateB?.id ? { id: templateB.id } : {}),
        subject, body_html: bodyHtml,
        sequence_number: seq, template_set_id: setId, variant: 'B',
      });
      setDirty(false);
      toast.success(t('templates.sequenceSaved', { num: displayNumber }));
    } catch {
      toast.error(t('templates.errorSaving'), { duration: 8000 });
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
          title={t('templates.dragToReorder')}
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
        {dirty && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>{t('common.unsaved')}</span>}
        {canDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title={t('templates.deleteSeqBtn')}
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
          <label style={LABEL}>{t('templates.emailSubject')}</label>
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
            {t('templates.insertInto', { field: activeField === 'subject' ? t('templates.subject') : t('templates.body') })}
          </span>
          {allVariables.map(v => (
            <button
              key={v.name}
              onClick={() => insertVariable(v.name)}
              style={{
                background: 'rgba(82,82,91,0.1)',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
                fontSize: 11, ...MONO, padding: '3px 8px',
                borderRadius: 4, cursor: 'pointer',
              }}
            >
              {`{{${v.name}}}`}
            </button>
          ))}
        </div>

        {/* Body editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LABEL}>{t('templates.emailBody')}</label>
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
            {upsertTemplate.isPending ? t('common.saving') : t('templates.saveSequence')}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

/* ── Detail page component ────────────────────────────── */
export default function TemplateSetDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthContext();
  const isAdmin = profile?.is_admin === true;
  const userTeamId = profile?.team_id;
  const { data: teams } = useTeamsSettings();
  const { data: sets, isLoading } = useTemplateSetsSettings(isAdmin ? undefined : userTeamId ?? undefined);
  const upsertTemplate = useUpsertTemplate();
  const deleteTemplate = useDeleteTemplate();
  const reorderSequences = useReorderSequences();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [confirmDeleteSeq, setConfirmDeleteSeq] = useState<number | null>(null);
  const [varsExpanded, setVarsExpanded] = useState(false);

  const selectedSet = sets?.find(s => s.id === id);
  const templates: EmailTemplate[] = selectedSet?.email_templates ?? [];

  const seqNumbers = Array.from(new Set(templates.map((t: EmailTemplate) => t.sequence_number))).sort((a, b) => a - b);

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

  const teamMap = new Map(teams?.map(t => [t.id, t.name]) ?? []);

  // Redirect to list if set not found (after loading)
  if (!isLoading && sets && !selectedSet) {
    navigate('/sablony', { replace: true });
    return null;
  }

  // ── Add sequence ──────────────────────────────────────
  async function handleAddSequence() {
    if (!id) return;
    const nextSeq = seqNumbers.length + 1;
    try {
      for (const variant of ['A', 'B']) {
        await upsertTemplate.mutateAsync({
          template_set_id: id,
          sequence_number: nextSeq,
          variant,
          subject: '',
          body_html: '',
        });
      }
      toast.success(t('templates.sequenceAdded', { num: nextSeq }));
    } catch {
      toast.error(t('templates.errorAddingSeq'), { duration: 8000 });
    }
  }

  // ── Delete sequence with auto-renumber ───────────────
  async function handleDeleteSequence() {
    if (confirmDeleteSeq === null || !id) return;
    const seq = confirmDeleteSeq;
    const pair = templatesBySeq.get(seq);
    try {
      if (pair?.A?.id) await deleteTemplate.mutateAsync(pair.A.id);
      if (pair?.B?.id) await deleteTemplate.mutateAsync(pair.B.id);
      const remaining = seqNumbers.filter(s => s !== seq).sort((a, b) => a - b);
      if (remaining.length > 0) {
        await reorderSequences.mutateAsync({ setId: id, order: remaining });
      }
      toast.success(t('templates.sequenceDeleted'));
    } catch {
      toast.error(t('templates.errorDeletingSeq'), { duration: 8000 });
    } finally {
      setConfirmDeleteSeq(null);
    }
  }

  // ── Drag-and-drop reorder ──────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !id) return;
    const oldIndex = seqNumbers.indexOf(active.id as number);
    const newIndex = seqNumbers.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...seqNumbers];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    try {
      await reorderSequences.mutateAsync({ setId: id, order: reordered });
      toast.success(t('templates.reorderDone'));
    } catch {
      toast.error(t('templates.errorReorder'), { duration: 8000 });
    }
  }

  if (isLoading) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>{t('templates.loading')}</p>;
  }

  const setName = selectedSet?.name ?? '';
  const teamName = isAdmin && selectedSet?.team_id ? teamMap.get(selectedSet.team_id) ?? '' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Breadcrumb items={[
        { label: t('templates.title'), to: '/sablony' },
        { label: setName },
      ]} />

      <PageHeader
        title={setName}
        subtitle={teamName || undefined}
        actions={
          <GlassButton size="sm" variant="secondary" onClick={() => navigate('/sablony')}>
            {t('common.back')}
          </GlassButton>
        }
      />

      {/* ── Variables info (expandable) ── */}
      <div style={{
        padding: '10px 16px', borderRadius: 8,
        background: 'rgba(62,207,142,0.04)', border: '1px solid rgba(62,207,142,0.15)',
      }}>
        <div
          onClick={() => setVarsExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}
        >
          <span>{t('templates.availableVars', { count: DEFAULT_VARIABLES.length })}</span>
          <code style={{ ...MONO, color: 'var(--text-dim)', fontSize: 10 }}>
            {DEFAULT_VARIABLES.map(v => `{{${v.name}}}`).join(' ')}
          </code>
          <span style={{
            marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)',
            transform: varsExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}>▼</span>
        </div>

        {varsExpanded && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEFAULT_VARIABLES.map(v => (
              <div key={v.name} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11 }}>
                <code style={{ ...MONO, color: '#3ECF8E', fontSize: 11, flexShrink: 0 }}>
                  {`{{${v.name}}}`}
                </code>
                <span style={{ color: 'var(--text-muted)' }}>— {v.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sequence panels ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('templates.sequences')}</div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={seqNumbers} strategy={verticalListSortingStrategy}>
            {seqNumbers.map((seq, idx) => {
              const pair = templatesBySeq.get(seq);
              return (
                <SequencePanel
                  key={`${id}-${seq}`}
                  seq={seq}
                  displayNumber={idx + 1}
                  templateA={pair?.A}
                  templateB={pair?.B}
                  allVariables={DEFAULT_VARIABLES}
                  setId={id!}
                  onDelete={() => setConfirmDeleteSeq(seq)}
                  canDelete={seqNumbers.length > 1}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        {seqNumbers.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
            {t('templates.noSequences')}
          </p>
        )}

        <GlassButton
          size="sm"
          variant="secondary"
          onClick={handleAddSequence}
          disabled={upsertTemplate.isPending}
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        >
          {t('templates.addSequence')}
        </GlassButton>
      </div>

      {/* ── Confirm Delete Sequence ── */}
      <ConfirmDialog
        open={confirmDeleteSeq !== null}
        onClose={() => setConfirmDeleteSeq(null)}
        onConfirm={handleDeleteSequence}
        title={t('templates.deleteSequence', { num: confirmDeleteSeq })}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={deleteTemplate.isPending}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          {t('templates.deleteSequenceConfirm', { num: confirmDeleteSeq })}
        </div>
      </ConfirmDialog>
    </div>
  );
}
