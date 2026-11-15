# Development and acceptance gates

This project is built incrementally. A new business page must not be created until its purpose, fields, actions, route, and navigation placement have been approved.

## Design-system foundation gate

- [ ] Carbon React controls are exposed through local component directories.
- [ ] Header, SideNav, Content, and AppShell are separate local layout entries.
- [ ] Carbon White is the single approved theme.
- [ ] IBM Plex Sans is loaded only through the local typography entry.
- [ ] Icons are imported only through the local Carbon icon entry.
- [ ] Semantic color, spacing, typography, motion, breakpoint, layer, elevation, z-index, and focus tokens are centralized.
- [ ] Grid, accessibility, localization, assets, data visualization, patterns, providers, hooks, and utilities have designated ownership directories.
- [ ] Product features do not import Carbon/font/icon packages directly.
- [ ] Product features do not define their own CSS declarations or inline visual styles.
- [ ] Design-system boundary check passes.

## Foundation build gate

- [ ] Dependencies install cleanly.
- [ ] TypeScript typecheck passes.
- [ ] Vite production build passes.
- [ ] Carbon White theme is emitted from the shared theme entrypoint.
- [ ] IBM Plex Sans is loaded from the project dependency.
- [ ] Shared AppShell uses local Carbon component entries.
- [ ] Shell spacing and breakpoints use centralized tokens.
- [ ] No business pages or navigation entries have been added without approval.

## Page gate

For every approved page:
- [ ] It has its own URL route.
- [ ] It lives in its own feature module.
- [ ] Applicable controls use actual Carbon React components through local entries.
- [ ] Loading, empty, error, and success states are covered.
- [ ] Direct URL entry, refresh, and browser history work.
- [ ] Layout and responsive behavior are checked against the shared AppShell.
- [ ] No feature-specific CSS duplicates Carbon controls or design tokens.
- [ ] Keyboard, focus, screen-reader, and reduced-motion behavior are verified.

## Branch and deployment policy

- All development commits target `develop`.
- Do not modify `main`.
- Do not deploy an incomplete scaffold over the existing production Worker.
- A successful GitHub commit is not proof of a successful build or deployment.
