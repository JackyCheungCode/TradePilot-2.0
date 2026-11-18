import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../design-system/layout/AppShell';
import { RequireAuth } from './RequireAuth';
import { LoginPage } from '../features/auth/LoginPage';
import { AgentWorkspacePage } from '../features/agent/AgentWorkspacePage';
import { ProspectDiscoveryPage } from '../features/prospect-discovery';
import { ProspectHistoryPage } from '../features/prospect-discovery/ProspectHistoryPage';
import { ProspectDataPage } from '../features/prospect-discovery/ProspectDataPage';
import { LeadCreatePage } from '../features/leads/LeadCreatePage';
import { LeadConsolePage } from '../features/leads/LeadConsolePage';
import { ContactConsolePage, ContactDetailPage, ContactFormPage } from '../features/contacts/ContactPages';
import { AccountConsolePage, AccountDetailPage, AccountFormPage } from '../features/accounts/AccountPages';
import { OpportunityConsolePage, OpportunityDetailPage, OpportunityFormPage } from '../features/opportunities/OpportunityPages';
import { QuoteConsolePage, QuoteDetailPage, QuoteFormPage } from '../features/quotes/QuotePages';
import { SalesOrderConsolePage, SalesOrderDetailPage, SalesOrderFormPage } from '../features/sales-orders/SalesOrderPages';
import { ProductConsolePage, ProductDetailPage, ProductFormPage } from '../features/products/ProductPages';
import { SettingsCenterPage } from '../features/settings/SettingsCenterPage';
import { SecuritySettingsPage } from '../features/security/SecuritySettingsPage';
import { PersonalSettingsPage } from '../features/settings/PersonalSettingsPage';
import { TradeToolsPage } from '../features/trade-tools/TradeToolsPage';
import { TradeToolsHubPage } from '../features/trade-tools/TradeToolsHubPage';
import { ShipmentConsolePage, ShipmentDetailPage, ShipmentFormPage } from '../features/shipments/ShipmentPages';
import { PaymentAllocationPage, PaymentConsolePage, PaymentDetailPage, PaymentFormPage } from '../features/payments/PaymentPages';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DocumentsCenterPage } from '../features/documents/DocumentsCenterPage';
import { GeneratedDocumentsPage } from '../features/documents/GeneratedDocumentsPage';
import { DocumentPreviewPage } from '../features/documents/DocumentPreviewPage';
import { DocumentStudioPage } from '../features/documents/DocumentStudioPage';
import { DocumentTemplateCenterPage } from '../features/documents/DocumentTemplateCenterPage';
import { DocumentCompanyProfilePage } from '../features/documents/DocumentCompanyProfilePage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'agent', element: <AgentWorkspacePage /> },
          { path: 'prospect-discovery', element: <ProspectDiscoveryPage /> },
          { path: 'prospect-history', element: <ProspectHistoryPage /> },
          { path: 'prospect-history/:runId', element: <ProspectHistoryPage /> },
          { path: 'prospect-data', element: <ProspectDataPage /> },
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
          { path: 'documents', element: <DocumentsCenterPage /> },
          { path: 'documents/studio', element: <DocumentStudioPage /> },
          { path: 'documents/templates', element: <DocumentTemplateCenterPage /> },
          { path: 'documents/company-profile', element: <DocumentCompanyProfilePage /> },
          { path: 'documents/generated', element: <GeneratedDocumentsPage /> },
          { path: 'documents/:id', element: <DocumentPreviewPage /> },
          { path: 'shipments', element: <ShipmentConsolePage /> },
          { path: 'shipments/new', element: <ShipmentFormPage /> },
          { path: 'shipments/:id/edit', element: <ShipmentFormPage /> },
          { path: 'shipments/:id', element: <ShipmentDetailPage /> },
          { path: 'payments', element: <PaymentConsolePage /> },
          { path: 'payments/new', element: <PaymentFormPage /> },
          { path: 'payments/:id/edit', element: <PaymentFormPage /> },
          { path: 'payments/:id/allocate', element: <PaymentAllocationPage /> },
          { path: 'payments/:id', element: <PaymentDetailPage /> },
          { path: 'products', element: <ProductConsolePage /> },
          { path: 'products/new', element: <ProductFormPage /> },
          { path: 'products/:id/edit', element: <ProductFormPage /> },
          { path: 'products/:id', element: <ProductDetailPage /> },
          { path: 'trade-tools', element: <TradeToolsHubPage /> },
          { path: 'trade-tools/legacy', element: <TradeToolsPage /> },
          { path: 'settings', element: <SettingsCenterPage /> },
          { path: 'personal-settings', element: <PersonalSettingsPage /> },
          { path: 'security', element: <SecuritySettingsPage /> },
          { path: 'contacts', element: <ContactConsolePage /> },
          { path: 'contacts/new', element: <ContactFormPage /> },
          { path: 'contacts/:id/edit', element: <ContactFormPage /> },
          { path: 'contacts/:id', element: <ContactDetailPage /> },
          { path: 'accounts', element: <AccountConsolePage /> },
          { path: 'accounts/new', element: <AccountFormPage /> },
          { path: 'accounts/:id/edit', element: <AccountFormPage /> },
          { path: 'accounts/:id', element: <AccountDetailPage /> },
        ],
      },
    ],
  },
]);
