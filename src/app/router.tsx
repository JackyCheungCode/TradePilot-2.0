import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../design-system/layout/AppShell';
import { ProspectDiscoveryPage } from '../features/prospect-discovery';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/prospect-discovery" replace /> },
      { path: 'prospect-discovery', element: <ProspectDiscoveryPage /> },
    ],
  },
]);
