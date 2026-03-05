import { type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  style?: CSSProperties;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:   'glass-btn-primary',
  secondary: 'glass-btn-secondary',
  danger:    'glass-btn-danger',
  ghost:     'glass-btn-secondary',
};

const SIZE_STYLES: Record<string, CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: 12 },
  md: { height: 34, padding: '0 14px', fontSize: 13 },
  lg: { height: 40, padding: '0 20px', fontSize: 14 },
};

export default function GlassButton({ variant = 'secondary', size = 'md', children, style, className, ...rest }: GlassButtonProps) {
  return (
    <button
      className={cn(VARIANT_CLASS[variant], className)}
      style={{ ...SIZE_STYLES[size], fontWeight: 500, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
