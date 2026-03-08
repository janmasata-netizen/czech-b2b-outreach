import { Navigate } from 'react-router-dom';
import { useAuthContext } from './AuthProvider';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthContext();
  if (!profile?.is_admin) return <Navigate to="/prehled" replace />;
  return <>{children}</>;
}
