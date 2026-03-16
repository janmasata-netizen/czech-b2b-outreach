import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar, { TOP_H } from './TopBar';
import SubPanel, { ICON_W, SUB_W, useHasSubPanel } from './SubPanel';
import { MobileNavProvider, useMobileNav } from '@/hooks/useMobileNav';
import { useRealtime } from '@/hooks/useRealtime';

function Shell() {
  useRealtime();
  const hasSubPanel = useHasSubPanel();
  const { isMobile } = useMobileNav();
  const mainLeft = isMobile ? 0 : hasSubPanel ? ICON_W + SUB_W : ICON_W;

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <TopBar />
      {!isMobile && <SubPanel />}
      <Sidebar />
      <main style={{
        marginLeft: mainLeft,
        marginTop: TOP_H,
        height: `calc(100vh - ${TOP_H}px)`,
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
