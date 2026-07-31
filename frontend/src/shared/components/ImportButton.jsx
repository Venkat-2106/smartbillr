// shared/components/ImportButton.jsx
//
// Reusable CSV import button — mirrors the ExportButton pattern.
// Triggers a file input, uploads the CSV to the backend, and shows
// a summary dialog with created/updated/error counts.
//
// FIX (2026-07-18): endpoint paths must NOT include /v1 prefix.
//   baseURL (import.meta.env.VITE_API_URL) already contains /v1.
//   Using "/v1/..." creates a double prefix → 404.
//
// USAGE:
//
//   <ImportButton
//     endpoint="/categories/import"
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
  requiredColumns = null, // array of {key, label, alternates?} — checked against CSV headers before upload
  sampleRows = [], // array of arrays — sample data rows included in the downloaded template
  disabled = false,
  mode = null,      // string — optional query param appended to endpoint (e.g. "update")
  onSuccess,       // callback after successful import
  hideTemplate = false, // boolean — when true, hides the standalone Template button
  compact = false,  // boolean — when true, renders a smaller button without label prefix
  buttonStyle = {}, // object — extra styles applied to the Import button
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  function validateHeaders(csvText) {
    if (!requiredColumns || requiredColumns.length === 0) return null;

    // Parse just the header row
    const firstLine = csvText.split('\n')[0];
    if (!firstLine) return ['CSV file is empty'];

    const headers = firstLine.split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const missing = [];

    for (const col of requiredColumns) {
      // Check key, label (template uses labels as headers), and any alternates
      const variants = [col.key, col.label, ...(col.alternates || [])].map(v => v.toLowerCase());
      const found = variants.some(v => headers.includes(v));
      if (!found) missing.push(col.label);
    }

    return missing.length > 0 ? missing : null;
  }

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

    // Pre-upload header validation — check required columns exist
    if (requiredColumns && requiredColumns.length > 0) {
      try {
        const text = await file.text();
        const missing = validateHeaders(text);
        if (missing) {
          toast.error(
            `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
            { duration: 6000 }
          );
          return;
        }
      } catch {
        toast.error('Could not read CSV file');
        return;
      }
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const url = mode ? `${endpoint}?mode=${mode}` : endpoint;
      const response = await api.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { summary, errors, message } = response.data;

      const savedCount = (summary?.created || 0) + (summary?.updated || 0) + (summary?.processed || 0);

      if (!summary || savedCount === 0) {
        // No rows were actually saved — this is a failure even if the server
        // returned 200 (bulk-import endpoints always return success_response).
        // Show the actual error detail if available, not the generic summary.
        // The fallback message references Import Guidelines (see ImportGuidelines.jsx)
        // so users know where to find correct column headers and required fields.
        const errorDetail = errors?.[0]?.message;
        toast.error(errorDetail || message || 'Import failed — no rows were saved. Check the Import Guidelines below for correct column headers and required fields.', { duration: 6000 });
      } else {
        // At least some rows were saved
        const errorCount = summary.errors || errors?.length || 0;
        const successMsg = errorCount > 0
          ? `${message} (${errors?.length || 0} rows had errors)`
          : message;

        toast.success(successMsg, { duration: errorCount > 0 ? 6000 : 3500 });

        if (errorCount > 0 && errors?.length > 0) {
          const lines = errors.slice(0, 10)
            .map(e => e.row === 0 ? e.message : `Row ${e.row}: ${e.message}`);
          if (errors.length > 10) {
            lines.push(`+ ${errors.length - 10} more row(s) with errors`);
          }
          const errorDetails = lines.join('\n');
          if (errorDetails) {
            toast(`Import issues:\n${errorDetails}`, {
              duration: 8000,
              style: { whiteSpace: 'pre-line' },
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
      downloadTemplateCsv(title.toLowerCase().replace(/\s+/g, '_'), columns, sampleRows);
      toast.success(`Downloaded ${title} import template`);
    } catch {
      toast.error('Failed to download template');
    }
  }

  const modeLabel = mode === 'update' ? 'Update' : 'Import';

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      {!hideTemplate && columns && (
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
        style={{ display: 'flex', alignItems: 'center', gap: '6px', ...buttonStyle }}
      >
        {!uploading && <UploadIcon />}
        {uploading
          ? `Importing ${title}...`
          : compact
            ? modeLabel
            : `${modeLabel} ${title}`}
      </Button>
    </>
  );
}