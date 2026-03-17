import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface DemoModeContextValue {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  toggleDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('demo-mode') === 'true');

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode(prev => {
      const next = !prev;
      if (next) localStorage.setItem('demo-mode', 'true');
      else localStorage.removeItem('demo-mode');
      return next;
    });
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, toggleDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDemoMode() {
  return useContext(DemoModeContext);
}
