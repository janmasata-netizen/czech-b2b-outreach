import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
  const isFirstRender = useRef(true);

  // Clear query cache AFTER state update is committed so queryFn closures
  // read the new isDemoMode value when they refetch.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    queryClient.removeQueries();
  }, [isDemoMode, queryClient]);

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
