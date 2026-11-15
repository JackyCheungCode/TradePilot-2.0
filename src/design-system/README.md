# TradePilot Design System

All application UI must be sourced from this local design-system layer.

## Import policy

Preferred:

```ts
import { Button, TextInput, Dropdown } from '@/design-system';
import { Search, Add } from '@/design-system/icons';
```

Also permitted when a component-specific import is clearer:

```ts
import { Button } from '@/design-system/components/Button';
import { Header } from '@/design-system/layout/Header';
```

Forbidden in feature and page code:

```ts
import { Button } from '@carbon/react';
```

Only files inside `src/design-system/**` may import from `@carbon/react` or `@carbon/icons-react`.

## Component ownership

- `components/<Component>/index.ts`: local entry point for an official Carbon React component.
- `layout/<Element>/index.ts`: local entry point for structural elements such as Header, SideNav, and Content.
- `icons/index.ts`: central Carbon icon entry.
- `tokens/`: shared Carbon White theme.
- `typography/`: typography policies and shared type treatments.

These are thin local entry points, not copied or forked Carbon source code. Carbon remains the implementation and accessibility source of truth.

## Usage rules

- Feature pages import from this local design-system layer only.
- Do not recreate Carbon controls with HTML/CSS.
- Do not add one-off theme overrides in feature modules.
- A local wrapper may add approved application-wide defaults, but must preserve Carbon props, keyboard behavior, focus behavior, and accessibility.
- Components not yet represented locally must be added here before feature code can use them.
- Carbon components are not automatically approved for every product interaction. Product information architecture and interaction choices remain subject to approval.
