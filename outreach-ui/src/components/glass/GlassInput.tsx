import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(({ label, error, className, style, ...rest }, ref) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={cn('glass-input', className)}
        style={style}
        {...rest}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
    </div>
  );
});

GlassInput.displayName = 'GlassInput';
export default GlassInput;
