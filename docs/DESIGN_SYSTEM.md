# TradePilot 2.0 — Design System

## Theme decision

The application-wide theme is **IBM Carbon White**.

- Use the official Carbon Design System v11 `white` theme as the default theme.
- Do not use Carbon `g10`, `g90`, or `g100` as the default application theme.
- Do not create a visually similar custom theme or override Carbon color tokens without an approved design-system decision.
- All application routes, shared components, forms, data tables, overlays, navigation, and empty/loading/error states must use the same White theme.

## Required UI foundation

- React + TypeScript.
- `@carbon/react` is the only foundational UI component library.
- `@carbon/icons-react` for Carbon icons.
- Use official Carbon components and design tokens for controls, typography, color, spacing, layering, and interaction states.
- IBM Plex Sans typography.
- Use Carbon Grid and Carbon layout primitives for responsive page structure.

## Visual principles

1. Organize information through Carbon background layers and spacing; use borders sparingly and only when they communicate structure.
2. Establish one shared AppShell: consistent header, side navigation, content width, page gutters, and responsive behavior.
3. Use Carbon spacing and typography tokens. Avoid arbitrary per-page values and one-off visual exceptions.
4. Prefer Carbon-native components over custom controls. Custom business components may compose Carbon components but must not imitate or replace them.
5. Keep control shapes, sizes, focus states, validation states, and interaction behavior consistent across the application.

## Prohibited foundations

- No shadcn/ui or Radix UI as the application component foundation.
- No browser-native select/dropdown as a substitute for Carbon Dropdown, ComboBox, or MultiSelect.
- No CSS-built replicas of Carbon controls.
- No page-specific theme palettes or independent component styling systems.

## Acceptance gate for every page

A page is ready for review only after checking:
- Carbon React components are used for all applicable controls.
- White theme is applied consistently, including overlays and nested content.
- Layout widths, alignment, gutters, and spacing match the shared AppShell.
- Typography, colors, and interaction states use Carbon tokens.
- Responsive behavior and keyboard/focus accessibility are verified.
- No prohibited component library or imitation control has been introduced.

This document is the design-system baseline for all new TradePilot 2.0 implementation on the `develop` branch.
