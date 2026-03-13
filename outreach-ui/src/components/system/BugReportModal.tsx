import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import GlassModal from '@/components/glass/GlassModal';
import GlassInput from '@/components/glass/GlassInput';
import GlassButton from '@/components/glass/GlassButton';
import { useAuthContext } from '@/components/AuthProvider';
import { useSubmitBugReport } from '@/hooks/useBugReport';
import type { BugReportSeverity, BugReportCategory } from '@/types/database';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SEVERITIES: BugReportSeverity[] = ['low', 'medium', 'high', 'critical'];
const CATEGORIES: BugReportCategory[] = ['ui', 'emails', 'enrichment', 'waves', 'system', 'other'];

export default function BugReportModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthContext();
  const submitMutation = useSubmitBugReport();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugReportSeverity>('medium');
  const [category, setCategory] = useState<BugReportCategory>('other');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setScreenshot(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !user) return;
    try {
      await submitMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        severity,
        category,
        screenshotFile: screenshot,
        reporterId: user.id,
      });
      // Reset & close
      setTitle('');
      setDescription('');
      setSeverity('medium');
      setCategory('other');
      setScreenshot(null);
      setPreview(null);
      onClose();
    } catch {
      // error handled by mutation
    }
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('bugReport.title')}
      width={500}
      footer={
        <GlassButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!title.trim() || !description.trim() || submitMutation.isPending}
        >
          {submitMutation.isPending ? t('bugReport.submitting') : t('bugReport.submit')}
        </GlassButton>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <GlassInput
          label={t('bugReport.titleLabel')}
          placeholder={t('bugReport.titlePlaceholder')}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
            {t('bugReport.description')}
          </label>
          <textarea
            className="glass-input"
            placeholder={t('bugReport.descriptionPlaceholder')}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            style={{ resize: 'vertical', minHeight: 80 }}
          />
        </div>

        {/* Severity + Category side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
              {t('bugReport.severity')}
            </label>
            <select value={severity} onChange={e => setSeverity(e.target.value as BugReportSeverity)} style={selectStyle}>
              {SEVERITIES.map(s => (
                <option key={s} value={s}>{t(`bugReport.severities.${s}` as 'bugReport.severities.low')}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
              {t('bugReport.category')}
            </label>
            <select value={category} onChange={e => setCategory(e.target.value as BugReportCategory)} style={selectStyle}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{t(`bugReport.categories.${c}` as 'bugReport.categories.ui')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Screenshot */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
            {t('bugReport.screenshot')}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ fontSize: 12, color: 'var(--text-dim)' }}
          />
          {preview && (
            <img
              src={preview}
              alt="Screenshot preview"
              style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, marginTop: 6, border: '1px solid var(--border)' }}
            />
          )}
        </div>
      </div>
    </GlassModal>
  );
}
