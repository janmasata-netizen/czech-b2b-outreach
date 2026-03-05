import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import useMobile from './useMobile';

interface MobileNavCtx {
  isMobile: boolean;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

const Ctx = createContext<MobileNavCtx>({
  isMobile: false,
  sidebarOpen: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
});

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const isMobile = useMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

  return (
    <Ctx.Provider value={{ isMobile, sidebarOpen, openSidebar, closeSidebar, toggleSidebar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMobileNav() {
  return useContext(Ctx);
}
