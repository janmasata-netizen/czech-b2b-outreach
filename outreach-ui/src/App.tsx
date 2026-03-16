import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@/components/AuthProvider';
import { DemoModeProvider } from '@/contexts/DemoModeContext';
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
import CompanyDetailPage from '@/pages/CompanyDetailPage';
import RetargetPoolPage from '@/pages/RetargetPoolPage';
import AdminRoute from '@/components/AdminRoute';
import TeamsSettings from '@/components/settings/TeamsSettings';
import ApiKeysSettings from '@/components/settings/ApiKeysSettings';
import TemplateSetDetailPage from '@/pages/TemplateSetDetailPage';
import TemplatesPage from '@/pages/TemplatesPage';
import SalesmenSettings from '@/components/settings/SalesmenSettings';
import UsersSettings from '@/components/settings/UsersSettings';
import SystemHealthPage from '@/pages/SystemHealthPage';
import BugReportDetailPage from '@/pages/BugReportDetailPage';
import AddLeadsToWavePage from '@/pages/AddLeadsToWavePage';
import ImportGroupDetailPage from '@/pages/ImportGroupDetailPage';

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
    <DemoModeProvider>
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
          <Route path="/databaze/:id" element={<CompanyDetailPage />} />
          <Route path="/leady" element={<LeadsPage />} />
          <Route path="/leady/skupiny/:id" element={<ImportGroupDetailPage />} />
          <Route path="/leady/:id" element={<LeadDetailPage />} />
          <Route path="/vlny" element={<WavesPage />} />
          <Route path="/vlny/:id" element={<WaveDetailPage />} />
          <Route path="/vlny/:id/pridat-leady" element={<AddLeadsToWavePage />} />
          <Route path="/email-finder" element={<AdminRoute><EmailFinderPage /></AdminRoute>} />
          <Route path="/system" element={<AdminRoute><SystemHealthPage /></AdminRoute>} />
          <Route path="/system/reports/:id" element={<AdminRoute><BugReportDetailPage /></AdminRoute>} />
          <Route path="/sablony" element={<TemplatesPage />} />
          <Route path="/sablony/:id" element={<TemplateSetDetailPage />} />
          <Route path="/retarget" element={<RetargetPoolPage />} />
          <Route path="/nastaveni" element={<AdminRoute><SettingsPage /></AdminRoute>}>
            <Route index element={null} />
            <Route path="tymy" element={<TeamsSettings />} />
            <Route path="obchodnici" element={<SalesmenSettings />} />
            <Route path="uzivatele" element={<UsersSettings />} />
            <Route path="api-klice" element={<ApiKeysSettings />} />
          </Route>
          <Route path="/" element={<Navigate to="/prehled" replace />} />
          <Route path="*" element={<Navigate to="/prehled" replace />} />
        </Route>
      </Routes>
    </DemoModeProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
