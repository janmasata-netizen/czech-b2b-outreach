import { Outlet, Navigate, useLocation } from 'react-router-dom';

export default function SettingsPage() {
  const { pathname } = useLocation();
  if (pathname === '/nastaveni' || pathname === '/nastaveni/') {
    return <Navigate to="/nastaveni/tymy" replace />;
  }
  return <Outlet />;
}
