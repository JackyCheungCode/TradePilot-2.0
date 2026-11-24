# Local Carbon component coverage

The component layer contains one local entry directory per Carbon component or closely related component family. The public barrel is `components/index.ts`; narrower imports may use the specific component directory.

## Form and input controls

Button and its Carbon variants, IconButton, Link, TextInput, TextArea, NumberInput, PasswordInput, Search, ExpandableSearch, Dropdown, ComboBox, MultiSelect, **TradePilot Select adapter (Carbon Dropdown-backed)**, SelectItem option descriptors, SelectItemGroup, Checkbox, CheckboxGroup, RadioButton, RadioButtonGroup, RadioTile, Toggle, Switch, Slider, DatePicker, DatePickerInput, TimePicker, TimePickerSelect, FileUploader and its subcomponents, Form, FormGroup, FormItem, FormLabel, and FluidForm.

## Data display and navigation

DataTable and its table primitives, DataTableSkeleton, Pagination, PaginationNav, ProgressBar, ProgressIndicator, Tag and tag variants, ListBox, StructuredList, TreeView, ContainedList, Tile and tile variants, Accordion, Breadcrumb, Tabs, TabContent, ContentSwitcher, Grid, Column, Row, Layer, Stack, AspectRatio, Header, SideNav, and Content.

## Feedback and assistance

Loading, InlineLoading, skeleton primitives, Modal and ComposedModal, ModalWrapper, Notification variants, Tooltip, DefinitionTooltip, Toggletip, Popover, ErrorBoundary, AILabel, and DialogProps typing.

## Menus, content and utilities

Menu, MenuItem, MenuButton, ComboButton, OverflowMenu, OverflowMenuItem, Carbon's `useContextMenu` hook, CodeSnippet, Copy, CopyButton, OrderedList, UnorderedList, ListItem, ClassPrefix, IdPrefix, and FeatureFlags. Carbon's ListBox and Portal primitives are exposed as types only because they are not public rendered components in the installed package API.

## Select policy

- Feature code must not render native `<select>` or `<option>` elements.
- The local `Select` compatibility API is implemented with Carbon React `Dropdown`, which uses Carbon's ListBox menu rather than a browser-native option popup.
- Use Carbon `ComboBox` when users need to type to search or filter options.
- Use Carbon `MultiSelect` or `FilterableMultiSelect` for multiple selections.
- Do not use Carbon React `Select` for user-facing option menus.

## API stability

Local entries must be checked against the installed `@carbon/react` version before use. Stable Carbon APIs are preferred. Experimental/unstable exports are intentionally excluded until separately approved. These files re-export Carbon implementations or compose stable Carbon components; they do not recreate controls.
