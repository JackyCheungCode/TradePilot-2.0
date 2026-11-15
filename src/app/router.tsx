import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../design-system/layout/AppShell';

/**
 * Route infrastructure only.
 * No product pages or navigation entries are registered until approved.
 * Each approved page will be added as its own lazy-loaded route/module.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [],
  },
]);
