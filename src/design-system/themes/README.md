# Themes

TradePilot uses IBM Carbon theme tokens as the source of truth.

- 白色 maps to Carbon White.
- 浅灰色 maps to Carbon G10.
- 深灰色 maps to Carbon G90.
- 深色 maps to Carbon G100.
- System resolves to White or G100 using the operating-system color-scheme preference.
- The signed-in account preference is stored in the owner-scoped `theme_preference` settings namespace and synchronized across devices.
- Browser local storage is only a per-account rendering cache; it is not the authoritative preference store.

All global Carbon theme variables are applied at the document root so Carbon portals, dialogs, menus, and popovers inherit the active theme.
