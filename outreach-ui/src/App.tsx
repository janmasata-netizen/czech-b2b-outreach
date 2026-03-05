import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@/components/AuthProvider';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import LeadsPage from '@/pages/LeadsPage';
import LeadDetailPage from '@/pages/LeadDetailPage';
import WavesPage from '@/pages/WavesPage';
import WaveDetailPage from '@/pages/WaveDetailPage';
import SettingsPage from '@/pages/SettingsPage';
import EmailFinderPage from '@/pages/EmailFinderPage';
import DatabasePage from '@/pages/DatabasePage';
import TeamsSettings from '@/components/settings/TeamsSettings';
import OutreachAccountsSettings from '@/components/settings/OutreachAccountsSettings';
import ApiKeysSettings from '@/components/settings/ApiKeysSettings';
import TemplateSetEditor from '@/components/settings/TemplateSetEditor';
import SalesmenSettings from '@/components/settings/SalesmenSettings';
import UsersSettings from '@/components/settings/UsersSettings';

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/prehled" element={<DashboardPage />} />
          <Route path="/databaze" element={<DatabasePage />} />
          <Route path="/leady" element={<LeadsPage />} />
          <Route path="/leady/:id" element={<LeadDetailPage />} />
          <Route path="/vlny" element={<WavesPage />} />
          <Route path="/vlny/:id" element={<WaveDetailPage />} />
          <Route path="/email-finder" element={<EmailFinderPage />} />
          <Route path="/nastaveni" element={<SettingsPage />}>
            <Route index element={null} />
            <Route path="tymy" element={<TeamsSettings />} />
            <Route path="obchodnici" element={<SalesmenSettings />} />
            <Route path="uzivatele" element={<UsersSettings />} />
            <Route path="ucty" element={<OutreachAccountsSettings />} />
            <Route path="api-klice" element={<ApiKeysSettings />} />
            <Route path="sablony" element={<TemplateSetEditor />} />
          </Route>
          <Route path="/" element={<Navigate to="/prehled" replace />} />
          <Route path="*" element={<Navigate to="/prehled" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
    </ErrorBoundary>
  );
}
