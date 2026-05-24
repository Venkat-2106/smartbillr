// src/shared/components/index.js
//
// Barrel export — import any shared component from one place:
//
//   import { Button, Modal, Table, Badge } from '../../../shared/components'
//
// Instead of:
//   import Button from '../../../shared/components/Button'
//   import Modal  from '../../../shared/components/Modal'
//   ... (verbose)

export { default as Button        } from './Button'
export { default as Input         } from './Input'
export { default as Badge         } from './Badge'
export { default as Spinner       } from './Spinner'
export { default as Modal         } from './Modal'
export { default as Table         } from './Table'
export { default as EmptyState    } from './EmptyState'
export { default as SearchBar     } from './SearchBar'
export { default as Pagination    } from './Pagination'
export { default as ConfirmDialog } from './ConfirmDialog'
export { default as PageHeader    } from './PageHeader'
export { default as FormField, selectStyle, textareaStyle } from './FormField'
