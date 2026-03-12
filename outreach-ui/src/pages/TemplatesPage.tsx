import { useSearchParams } from 'react-router-dom';
import TemplateSetEditor from '@/components/settings/TemplateSetEditor';
import WavePresetsTab from '@/components/settings/WavePresetsTab';

export default function TemplatesPage() {
  const [sp] = useSearchParams();
  const tab = sp.get('tab');

  if (tab === 'presets') return <WavePresetsTab />;
  return <TemplateSetEditor />;
}
