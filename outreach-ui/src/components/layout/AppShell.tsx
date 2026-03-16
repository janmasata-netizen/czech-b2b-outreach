import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar, { TOP_H } from './TopBar';
import SubPanel, { ICON_W, SUB_W, useHasSubPanel } from './SubPanel';
import { MobileNavProvider, useMobileNav } from '@/hooks/useMobileNav';
import { useRealtime } from '@/hooks/useRealtime';
import { useDemoMode } from '@/contexts/DemoModeContext';

const DEMO_BANNER_H = 28;

function Shell() {
  useRealtime();
  const hasSubPanel = useHasSubPanel();
  const { isMobile } = useMobileNav();
  const { isDemoMode } = useDemoMode();
  const mainLeft = isMobile ? 0 : hasSubPanel ? ICON_W + SUB_W : ICON_W;
  const topOffset = TOP_H + (isDemoMode ? DEMO_BANNER_H : 0);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <TopBar />
      {isDemoMode && (
        <div style={{
          position: 'fixed',
          top: TOP_H,
          left: 0,
          right: 0,
          height: DEMO_BANNER_H,
          background: 'rgba(245,158,11,0.10)',
          borderBottom: '1px solid rgba(245,158,11,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 249,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.05em',
          color: '#f59e0b',
        }}>
          DEMO REZIM — zobrazena data jsou fiktivni
        </div>
      )}
      {!isMobile && <SubPanel />}
      <Sidebar />
      <main style={{
        marginLeft: mainLeft,
        marginTop: topOffset,
        height: `calc(100vh - ${topOffset}px)`,
        overflow: 'auto',
        background: 'var(--bg-base)',
        transition: isMobile ? 'none' : 'margin-left 0.2s ease',
      }}>
        <div style={{ padding: isMobile ? '16px 14px' : '24px 28px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function AppShell() {
  return (
    <MobileNavProvider>
      <Shell />
    </MobileNavProvider>
  );
}
