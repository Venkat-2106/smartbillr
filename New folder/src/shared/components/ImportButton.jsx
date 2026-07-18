// shared/components/ImportButton.jsx
//
// Reusable CSV import button — mirrors the ExportButton pattern.
// Triggers a file input, uploads the CSV to the backend, and shows
// a summary dialog with created/updated/error counts.
//
// USAGE:
//
//   <ImportButton
//     endpoint="/v1/categories/import"
//     title="Import Categories"
//     filename="categories.csv"
//     instructions="Download our template, fill it in, and upload it."
//     onSuccess={() => queryClient.invalidateQueries({ queryKey: categoryKeys.all })}
//   />

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Button from './Button';
import { downloadTemplateCsv } from '../utils/csvExport';

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      style={{ width: '16px', height: '16px', flexShrink: 0 }}>
      <path fillRule="evenodd"
        d="M10 16a.75.75 0 01-.75-.75V8.06L6.78 10.53a.75.75 0 11-1.06-1.06l3.75-3.75a.75.75 0 011.06 0l3.75 3.75a.75.75 0 11-1.06 1.06L10.75 8.06v7.19A.75.75 0 0110 16zM16.75 4.5a.75.75 0 000-1.5H3.25a.75.75 0 000 1.5h13.5z"
        clipRule="evenodd" />
    </svg>
  );
}

function DownloadTemplateIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      style={{ width: '16px', height: '16px', flexShrink: 0 }}>
      <path fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v7.19l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 9.53a.75.75 0 111.06-1.06L9.25 10.94V3.75A.75.75 0 0110 3zM3.25 15a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.25z"
        clipRule="evenodd" />
    </svg>
  );
}

export default function ImportButton({
  endpoint,        // string — API endpoint URL (e.g. "/v1/categories/import")
  title = 'Import', // string — displayed in toast messages and template filename
  columns = null,  // array of {key, label} — if provided, shows a "Download Template" link
  disabled = false,
  onSuccess,       // callback after successful import
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the file input so the user can re-select the same file
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file (.csv)');
      return;
    }

    // Validate file size (max ~5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File is too large — maximum 5 MB');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { summary, errors, message } = response.data;

      if (!summary || summary.errors === summary.valid_rows) {
        // All rows failed
        toast.error(message || 'Import failed — all rows had errors', { duration: 6000 });
      } else {
        // Success with some errors
        const errorCount = summary.errors || errors?.length || 0;
        const successMsg = errorCount > 0
          ? `${message} (${errors?.length || 0} rows had errors)`
          : message;

        toast.success(successMsg, { duration: errorCount > 0 ? 6000 : 3500 });

        if (errorCount > 0 && errors?.length > 0 && errors.length <= 20) {
          // Show first few errors for debugging
          const errorDetails = errors.slice(0, 5)
            .map(e => `Row ${e.row}: ${e.message}`)
            .join('\n');
          if (errorDetails) {
            toast(`Error details:\n${errorDetails}`, {
              duration: 8000,
              style: { fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-line' },
            });
          }
        }
      }

      // Invalidate queries or trigger refresh
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      const serverMsg = err?.response?.data?.message || err?.message || 'Upload failed';
      toast.error(serverMsg, { duration: 6000 });
    } finally {
      setUploading(false);
      // Reset file input for next upload
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function triggerFileInput() {
    fileInputRef.current?.click();
  }

  function handleDownloadTemplate() {
    try {
      downloadTemplateCsv(title.toLowerCase().replace(/\s+/g, '_'), columns);
      toast.success(`Downloaded ${title} import template`);
    } catch {
      toast.error('Failed to download template');
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      {columns && (
        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          disabled={disabled || uploading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <DownloadTemplateIcon />
          Template
        </Button>
      )}
      <Button
        variant="outline"
        onClick={triggerFileInput}
        loading={uploading}
        disabled={disabled || uploading}
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        {!uploading && <UploadIcon />}
        {uploading ? `Importing ${title}...` : `Import ${title}`}
      </Button>
    </>
  );
}