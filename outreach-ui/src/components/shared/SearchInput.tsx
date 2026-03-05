import { type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export default function SearchInput({ onClear, value, ...rest }: SearchInputProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none', flexShrink: 0 }} />
      <input
        className="glass-input"
        value={value}
        style={{ paddingLeft: 30, paddingRight: value ? 30 : 10 }}
        {...rest}
      />
      {value && onClear && (
        <button
          onClick={onClear}
          style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 3 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
