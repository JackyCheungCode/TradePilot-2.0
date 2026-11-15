import { createBrowserRouter, Outlet } from 'react-router-dom';

/**
 * Route infrastructure only.
 * Product pages and navigation entries are intentionally not created here.
 * Add each approved page as its own lazy-loaded route and feature module.
 */
function ApplicationRouteRoot() {
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ApplicationRouteRoot />,
    children: [],
  },
]);