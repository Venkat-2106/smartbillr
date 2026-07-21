// shared/components/BulkImportPanel.jsx
//
// Compact bulk-import action bar for PageHeader action slots.
// Renders import buttons grouped by mode (Create / Update) with
// a standalone template-download icon and a compact import button.
//
// Guidelines are rendered by the companion component
// BulkImportGuidelines (outside PageHeader, as page-level content).
//
// USAGE:
//
//   import { BulkImportPanel } from '../../../shared/components'
//   import { categoryImportConfig } from '../importConfig'
//
//   <PageHeader
//     action={
//       <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
//         <ExportButton ... />
//         <BulkImportPanel config={categoryImportConfig} canImport={canManage} />
//         <Button>Add Category</Button>
//       </div>
//     }
//   />

import toast from 'react-hot-toast';
import ImportButton from './ImportButton';
import { downloadTemplateCsv } from '../utils/csvExport';

// ── SVG icons (module-scope to avoid re-creation on every render) ────────────

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      style={{ width: 14, height: 14, flexShrink: 0 }}>
      <path fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v7.19l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 9.53a.75.75 0 111.06-1.06L9.25 10.94V3.75A.75.75 0 0110 3zM3.25 15a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.25z"
        clipRule="evenodd" />
    </svg>
  );
}

// ── Mode divider ─────────────────────────────────────────────────────────────

function ModeDivider() {
  return (
    <div style={{
      width: 1,
      height: 22,
      background: 'var(--border)',
      flexShrink: 0,
    }} />
  );
}

// ── Import mode group (template icon + import button per mode) ────────────────

function ImportModeGroup({ mode, endpoint, title, columns, sampleRows, requiredColumns }) {
  function handleDownloadTemplate() {
    const name = title.toLowerCase().replace(/\s+/g, '_');
    const suffix = mode === 'update' ? '_update' : '_create';
    try {
      downloadTemplateCsv(`${name}${suffix}`, columns, sampleRows);
      toast.success(`Downloaded ${title} ${mode === 'update' ? 'update ' : ''}import template`);
    } catch {
      toast.error('Failed to download template');
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {/* Hidden file input for template download is handled by ImportButton.
          This standalone template icon button triggers the same download. */}
      {columns && (
        <button
          type="button"
          onClick={handleDownloadTemplate}
          title={`Download ${title} ${mode === 'update' ? 'update ' : ''}template`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 38,
            minWidth: 38,
            padding: '0 10px',
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRight: 'none',
            borderRadius: '10px 0 0 10px',
            cursor: 'pointer',
            transition: 'all 0.16s var(--ease-out, cubic-bezier(0.34,1.26,0.64,1))',
            flexShrink: 0,
            fontFamily: 'var(--font-sans, "Inter", sans-serif)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.borderColor = 'var(--border-hover)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-subtle)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <DownloadIcon />
        </button>
      )}
      <ImportButton
        endpoint={endpoint}
        title={title}
        mode={mode === 'update' ? 'update' : null}
        columns={columns}
        sampleRows={sampleRows}
        requiredColumns={requiredColumns}
        hideTemplate
        compact
        buttonStyle={columns ? { borderRadius: '0 10px 10px 0' } : undefined}
      />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function BulkImportPanel({ config, canImport = true }) {
  const {
    endpoint,
    title,
    create: {
      columns: createColumns,
      sampleRows: createSamples,
      requiredColumns: createRequired = [],
    },
    update = null,
  } = config;

  if (!canImport) return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {createColumns && (
        <ImportModeGroup
          mode="create"
          endpoint={endpoint}
          title={title}
          columns={createColumns}
          sampleRows={createSamples}
          requiredColumns={createRequired}
        />
      )}
      {update && (
        <>
          <ModeDivider />
          <ImportModeGroup
            mode="update"
            endpoint={endpoint}
            title={title}
            columns={update.columns || createColumns}
            sampleRows={update.sampleRows}
            requiredColumns={update.requiredColumns || []}
          />
        </>
      )}
    </div>
  );
}
