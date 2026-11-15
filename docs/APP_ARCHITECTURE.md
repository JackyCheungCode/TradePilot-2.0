# TradePilot 2.0 — Modular Application Architecture

## Non-negotiable routing rule

Every independently navigable page must have its own explicit URL route. Do not implement page switching through tabs, conditional rendering inside a single catch-all page, or menu-only state.

Use React Router for client-side routing. Each route must resolve to a page module and support direct URL entry, browser refresh, back/forward navigation, and permission-aware access where applicable.

## Module boundaries

Organize the application by business feature. Each feature owns its page components, feature-specific components, hooks, schemas, and API adapters. Shared design-system components and application shell live outside feature modules. The Cloudflare Worker backend is isolated under `worker/src/`; frontend feature modules must not import server-side code.

Suggested structure:

```text
src/
  app/
    App.tsx
    router.tsx
    routeRegistry.ts
    providers/
  shell/
    AppShell/
    Header/
    SideNav/
  design-system/
    tokens/
    components/
  features/
    dashboard/
      pages/
      components/
      hooks/
      api/
    agents/
      pages/
      components/
      hooks/
      api/
    lead-discovery/
      pages/
      components/
      hooks/
      api/
    task-center/
      pages/
      components/
      hooks/
      api/
    search-results/
      pages/
      components/
      hooks/
      api/
    contact-enrichment/
      pages/
      components/
      hooks/
      api/
    integrations/
      pages/
      components/
      hooks/
      api/
  shared/
    components/
    hooks/
    lib/
    types/
```

## Route conventions

- Use stable, human-readable paths, lowercase and kebab-case.
- Each page gets its own route, even when pages share a feature.
- Nested routes are allowed for related sub-pages, but each nested page remains addressable by its own URL.
- Keep route definitions centralized in the app router/route registry; feature implementation remains inside its feature folder.
- Navigation entries must link to routes; navigation state must derive from the current URL.
- Unknown paths render a Carbon-styled Not Found page.
- Use lazy loading for feature page modules where practical.
- Route-level loading and error boundaries must be consistent and Carbon-themed.
- Query parameters represent page state such as filters/search terms, not substitute routes for distinct pages.

## Example route map

| Page | Route |
|---|---|
| Dashboard | `/dashboard` |
| Agent management | `/agents` |
| Agent detail | `/agents/:agentId` |
| Lead discovery | `/lead-discovery` |
| Task execution center | `/tasks` |
| Search results | `/search-results` |
| Contact enrichment | `/contact-enrichment` |
| AI and API integrations | `/integrations` |

The final route map must be confirmed against the product information architecture before all business pages are implemented. These paths are the initial conventions, not a claim that every feature is already implemented.

## Page/module contract

Each feature page must:
1. Be independently addressable by URL.
2. Export a page-level component from its feature module.
3. Keep feature-specific state and business logic within that module.
4. Use shared AppShell and Carbon-native shared components.
5. Call backend services through typed feature API adapters rather than embedding network logic in presentational components.
6. Provide loading, empty, error, and success states.
7. Have route-level tests for rendering and direct navigation.

## Backend boundary\n\nThe recovered Cloudflare Worker source lives in `worker/src/`. API routes and Workflow classes stay server-side. Frontend modules call typed API adapters; they must not import Worker route or Workflow implementation files. The Worker source baseline and deployment safety requirements are documented in `docs/WORKER_INTEGRATION.md`. No Worker deployment configuration is committed yet because the repository must first complete binding reconciliation and safe build validation.\n\n## Design-system constraint

All modules must follow `docs/DESIGN_SYSTEM.md`: IBM Carbon React v11 and the Carbon White theme are mandatory. Feature modules may compose Carbon components but may not introduce another foundational component library or a parallel visual system.
