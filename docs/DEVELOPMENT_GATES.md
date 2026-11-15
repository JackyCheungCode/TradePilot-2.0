# Development and acceptance gates

This project is built incrementally. A new business page must not be created until its purpose, fields, actions, route, and navigation placement have been approved.

## Foundation gate

- [ ] Dependencies install cleanly.
- [ ] TypeScript typecheck passes.
- [ ] Vite production build passes.
- [ ] Carbon White theme is emitted from the shared theme entrypoint.
- [ ] IBM Plex Sans is loaded from the project dependency.
- [ ] Shared AppShell uses Carbon components.
- [ ] Shell spacing uses Carbon spacing tokens.
- [ ] No business pages or navigation entries have been added without approval.

## Page gate

For every approved page:
- [ ] It has its own URL route.
- [ ] It lives in its own feature module.
- [ ] Applicable controls use actual Carbon React components.
- [ ] Loading, empty, error, and success states are covered.
- [ ] Direct URL entry, refresh, and browser history work.
- [ ] Layout and responsive behavior are checked against the shared AppShell.
- [ ] No feature-specific CSS duplicates Carbon controls or design tokens.

## Branch and deployment policy

- All development commits target `develop`.
- Do not modify `main`.
- Do not deploy an incomplete scaffold over the existing production Worker.
- A successful GitHub commit is not proof of a successful build or deployment.
