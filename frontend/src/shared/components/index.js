// shared/components/index.js
//
// Barrel export for all shared components.
// Import any component from this single file:
//
//   import { Button, Modal, StateDropdown, ExportButton } from '../../../shared/components'
//
// ── HOW TO USE ────────────────────────────────────────────────────────────────
// NAMED exports only — every component here uses `export default` in its own file
// and is re-exported as a named export here.
// CORRECT:   import { Button } from '../../../shared/components'
// CORRECT:   import Button from '../../../shared/components/Button'
// INCORRECT: import Button from '../../../shared/components'   ← won't work (no default export here)

export { default as Button }         from './Button';
export { default as Input }          from './Input';
export { default as Badge }          from './Badge';
export { default as Spinner }        from './Spinner';
export { default as Modal }          from './Modal';
export { default as ModalPortal }    from './ModalPortal';
export { default as Table }          from './Table';
export { default as EmptyState }     from './EmptyState';
export { default as SearchBar }      from './SearchBar';
export { default as Pagination }     from './Pagination';
export { default as ConfirmDialog }  from './ConfirmDialog';
export { default as PageHeader }     from './PageHeader';
export { default as FormField }      from './FormField';
export { selectStyle, textareaStyle } from './FormField';
export { default as DateRangeFilter } from './DateRangeFilter';
export { default as SelectField }    from './SelectField'; 

// ── NEW COMPONENTS (added in this review session) ─────────────────────────────
export { default as StateDropdown }  from './StateDropdown';   // Country-aware state/province picker
export { default as ExportButton }   from './ExportButton';    // One-click CSV export for any list page
export { default as SkeletonTable }  from './SkeletonTable';  // Animated loading placeholder for tables
export { default as ErrorBoundary }  from './ErrorBoundary';  // Catches render errors, shows fallback UI
export { default as CommandPalette } from './CommandPalette';  // Ctrl+K command palette
export { default as ShortcutHelp }   from './ShortcutHelp';    // ? keyboard shortcuts help