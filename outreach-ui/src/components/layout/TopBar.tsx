import { useState, useRef, useEffect } from 'react';
import { LogOut, Settings, Menu, Bug, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/components/AuthProvider';
import { useMobileNav } from '@/hooks/useMobileNav';
import { useDemoMode } from '@/contexts/DemoModeContext';
import BugReportModal from '@/components/system/BugReportModal';

export const TOP_H = 48;

export default function TopBar() {
  const { user, profile, signOut } = useAuthContext();
  const { isMobile, toggleSidebar } = useMobileNav();
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggleLang = () => {
    const next = i18n.language === 'cs' ? 'en' : 'cs';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? t('auth.user');
  const initials = displayName.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <header style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: TOP_H,
      background: 'var(--bg-sidebar)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: isMobile ? '0 12px' : '0 16px 0 12px',
      zIndex: 250,
      gap: 8,
    }}>
      {/* Left: hamburger (mobile) + logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile && (
          <button
            onClick={toggleSidebar}
            aria-label="Toggle menu"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Menu size={20} />
          </button>
        )}
        <img
          src="/meisat-logo.png"
          alt="Meisat"
          style={{ height: isMobile ? 26 : 30, width: 'auto', display: 'block' }}
        />
      </div>

      {/* Right: lang toggle + user avatar + dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={toggleLang}
          title={i18n.language === 'cs' ? 'Switch to English' : 'Přepnout do češtiny'}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-dim)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none'; }}
        >
          {i18n.language === 'cs' ? 'EN' : 'CS'}
        </button>
        <button
          onClick={() => setBugModalOpen(true)}
          title={t('bugReport.title')}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-dim)',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none'; }}
        >
          <Bug size={16} />
        </button>
        <button
          onClick={toggleDemoMode}
          title={isDemoMode ? 'Vypnout demo rezim' : 'Zapnout demo rezim'}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: `1px solid ${isDemoMode ? '#f59e0b' : 'var(--border)'}`,
            background: isDemoMode ? 'rgba(245,158,11,0.12)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: isDemoMode ? '#f59e0b' : 'var(--text-dim)',
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
            position: 'relative',
          }}
          onMouseEnter={e => { if (!isDemoMode) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-surface)'; } }}
          onMouseLeave={e => { if (!isDemoMode) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none'; } }}
        >
          <Eye size={16} />
          {isDemoMode && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 6, height: 6, borderRadius: '50%',
              background: '#f59e0b',
              boxShadow: '0 0 6px rgba(245,158,11,0.6)',
            }} />
          )}
        </button>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          title={displayName}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--green-bg)',
            border: '1px solid var(--green-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'var(--green)',
            transition: 'border-color 0.15s, background 0.15s',
          }}>
            {initials}
          </div>
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
            minWidth: 210,
            zIndex: 300,
            overflow: 'hidden',
            animation: 'modal-pop-in 0.12s ease-out forwards',
          }}>
            {/* User info */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'var(--green-bg)',
                border: '1px solid var(--green-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: 'var(--green)',
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: 5 }}>
              <Link
                to="/nastaveni"
                onClick={() => setOpen(false)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  background: 'none',
                  borderRadius: 5,
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  textDecoration: 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-muted)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = 'var(--text-dim)';
                }}
              >
                <Settings size={14} />
                {t('nav.settings')}
              </Link>
              <button
                onClick={() => { setOpen(false); signOut(); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--red)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <LogOut size={14} />
                {t('auth.logout')}
              </button>
            </div>

          </div>
        )}
      </div>
      </div>
      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />
    </header>
  );
}
