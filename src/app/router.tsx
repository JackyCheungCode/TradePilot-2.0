import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../design-system/layout/AppShell';
import { RequireAuth } from './RequireAuth';
import { LoginPage } from '../features/auth/LoginPage';
import { ProspectDiscoveryPage, ProspectConsolePage, RecentTasksPage } from '../features/prospect-discovery';
import { LeadCreatePage } from '../features/leads/LeadCreatePage';
import { LeadConsolePage } from '../features/leads/LeadConsolePage';
import { ContactConsolePage, ContactDetailPage, ContactFormPage } from '../features/contacts/ContactPages';
import { AccountConsolePage, AccountDetailPage, AccountFormPage } from '../features/accounts/AccountPages';
import { OpportunityConsolePage, OpportunityDetailPage, OpportunityFormPage } from '../features/opportunities/OpportunityPages';
import { QuoteConsolePage, QuoteDetailPage, QuoteFormPage } from '../features/quotes/QuotePages';
import { SalesOrderConsolePage, SalesOrderDetailPage, SalesOrderFormPage } from '../features/sales-orders/SalesOrderPages';
import { ProductConsolePage, ProductDetailPage, ProductFormPage } from '../features/products/ProductPages';
import { SettingsCenterPage } from '../features/settings/SettingsCenterPage';

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
          { path: 'opportunities', element: <OpportunityConsolePage /> },
          { path: 'opportunities/new', element: <OpportunityFormPage /> },
          { path: 'opportunities/:id/edit', element: <OpportunityFormPage /> },
          { path: 'opportunities/:id', element: <OpportunityDetailPage /> },
          { path: 'quotes', element: <QuoteConsolePage /> },
          { path: 'quotes/new', element: <QuoteFormPage /> },
          { path: 'quotes/:id/edit', element: <QuoteFormPage /> },
          { path: 'quotes/:id', element: <QuoteDetailPage /> },
          { path: 'sales-orders', element: <SalesOrderConsolePage /> },
          { path: 'sales-orders/new', element: <SalesOrderFormPage /> },
          { path: 'sales-orders/:id/edit', element: <SalesOrderFormPage /> },
          { path: 'sales-orders/:id', element: <SalesOrderDetailPage /> },
          { path: 'products', element: <ProductConsolePage /> },
          { path: 'products/new', element: <ProductFormPage /> },
          { path: 'products/:id/edit', element: <ProductFormPage /> },
          { path: 'products/:id', element: <ProductDetailPage /> },
          { path: 'settings', element: <SettingsCenterPage /> },
          { path: 'contacts', element: <ContactConsolePage /> },
          { path: 'contacts/new', element: <ContactFormPage /> },
          { path: 'contacts/:id/edit', element: <ContactFormPage /> },
          { path: 'contacts/:id', element: <ContactDetailPage /> },
          { path: 'accounts', element: <AccountConsolePage /> },
          { path: 'accounts/new', element: <AccountFormPage /> },
          { path: 'accounts/:id/edit', element: <AccountFormPage /> },
          { path: 'accounts/:id', element: <AccountDetailPage /> },
          { path: 'recent-tasks', element: <RecentTasksPage /> },
        ],
      },
    ],
  },
]);
