// shared/components/BulkImportGuidelines.jsx
//
// Renders ImportGuidelines panels for create + update modes.
// This component is rendered OUTSIDE the PageHeader action slot,
// as page-level content below the header.
//
// Paired with BulkImportPanel (which renders only action buttons
// inside the PageHeader action slot).
//
// USAGE:
//
//   import { BulkImportGuidelines } from '../../../shared/components'
//   import { categoryImportConfig } from '../importConfig'
//
//   {/* Below PageHeader, as a page-level block */}
//   <BulkImportGuidelines config={categoryImportConfig} />

import ImportGuidelines from './ImportGuidelines';

export default function BulkImportGuidelines({ config }) {
  const {
    title,
    create: {
      columns: createColumns,
      sampleRows: createSamples,
      guidelines: createGuidelines,
    },
    update = null,
  } = config;

  if (!createGuidelines && !(update?.guidelines)) return null;

  return (
    <>
      {createGuidelines && (
        <ImportGuidelines
          guidelines={createGuidelines}
          columns={createColumns}
          sampleRows={createSamples}
          templateName={`${title.toLowerCase().replace(/\s+/g, '_')}_create`}
        />
      )}
      {update?.guidelines && (
        <ImportGuidelines
          guidelines={update.guidelines}
          columns={update.columns || createColumns}
          sampleRows={update.sampleRows}
          templateName={`${title.toLowerCase().replace(/\s+/g, '_')}_update`}
        />
      )}
    </>
  );
}
