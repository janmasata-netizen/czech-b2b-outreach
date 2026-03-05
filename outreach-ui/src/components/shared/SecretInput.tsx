import { useState, type InputHTMLAttributes } from 'react';

interface SecretInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function SecretInput({ label, ...rest }: SecretInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          className="glass-input"
          type={show ? 'text' : 'password'}
          style={{ paddingRight: 40, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
        >{show ? '🙈' : '👁'}</button>
      </div>
    </div>
  );
}
