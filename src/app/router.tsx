import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../design-system/layout/AppShell';
import { RequireAuth } from './RequireAuth';
import { LoginPage } from '../features/auth/LoginPage';
import { ProspectDiscoveryPage, ProspectConsolePage, RecentTasksPage } from '../features/prospect-discovery';
import { LeadCreatePage } from '../features/leads/LeadCreatePage';
import { LeadConsolePage } from '../features/leads/LeadConsolePage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/prospect-console" replace /> },
          { path: 'prospect-discovery', element: <ProspectDiscoveryPage /> },
          { path: 'prospect-console', element: <ProspectConsolePage /> },
          { path: 'leads', element: <LeadConsolePage /> },
          { path: 'leads/new', element: <LeadCreatePage /> },
          { path: 'recent-tasks', element: <RecentTasksPage /> },
        ],
      },
    ],
  },
]);
