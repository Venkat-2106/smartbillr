// shared/components/ExportButton.jsx
//
// Reusable CSV export button.
// Plugs into any list page — just pass the data + column config.
//
// USAGE:
//
//   import ExportButton from '../../../shared/components/ExportButton'
//   import { CUSTOMER_CSV_COLUMNS } from '../../../shared/utils/csvExport'
//
//   // In your page (pass filtered data so export matches what's on screen):
//   <ExportButton
//     data={filteredCustomers}
//     filename="customers"
//     columns={CUSTOMER_CSV_COLUMNS}
//   />
//
//   // Or use custom columns inline:
//   <ExportButton
//     data={products}
//     filename="products"
//     columns={[
//       { key: 'prod_name',       label: 'Product Name' },
//       { key: 'prod_sell_price', label: 'Sell Price' },
//       { key: 'prod_stock_qty',  label: 'Stock' },
//     ]}
//   />
//
// PROPS:
//   data       {Array}  - Records to export (use filtered/sorted data — what user sees)
//   filename   {string} - Base filename (date appended automatically, e.g. "customers_2025-08-15.csv")
//   columns    {Array}  - Column definitions from csvExport.js
//   disabled   {bool}   - Disable the button (optional)
//   label      {string} - Button text (default: "Export CSV")

import { exportToCSV } from '../utils/csvExport';
import Button from './Button';
import toast from 'react-hot-toast';

// Arrow-down-tray icon (inline SVG — avoids heroicons import just for one icon)
function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      style={{ width: '16px', height: '16px', flexShrink: 0 }}
    >
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v7.19l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 9.53a.75.75 0 011.06-1.06L9.25 10.94V3.75A.75.75 0 0110 3zM3.25 15a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.25z"
        clipRule="evenodd"
      />
    </svg>
  );
}


export default function ExportButton({
  data = [],
  filename = 'export',
  columns = [],
  disabled = false,
  label = 'Export CSV',
}) {
  function handleExport() {
    if (!data || data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      exportToCSV(data, filename, columns);
      // Small success feedback
      toast.success(`Exported ${data.length} records to CSV`);
    } catch (err) {
      console.error('[ExportButton] Export failed:', err);
      toast.error('Export failed. Please try again.');
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={disabled || data.length === 0}
      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
    >
      <DownloadIcon />
      {label}
    </Button>
  );
}
