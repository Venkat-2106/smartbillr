// src/shared/components/FormField.jsx
//
// A wrapper that connects React Hook Form's register/errors to the Input component.
// Also wraps Select, Textarea, and custom inputs.
//
// Props:
//   label       → field label string
//   error       → field error (pass errors.fieldName from React Hook Form)
//   required    → adds a red asterisk to the label
//   children    → the actual <Input />, <select>, <textarea> etc.
//   helper      → optional helper text (shown when no error)
//
// Usage with React Hook Form + Input component:
//
//   const { register, formState: { errors } } = useForm()
//
//   <FormField label="Category Name" error={errors.name} required>
//     <Input
//       placeholder="e.g. Electronics"
//       {...register('name')}
//     />
//   </FormField>
//
// Usage with a native <select>:
//
//   <FormField label="Tax Rate" error={errors.tax_rate}>
//     <select {...register('tax_rate')} style={selectStyle}>
//       <option value="">Select rate</option>
//       <option value="0">0%</option>
//       <option value="5">5%</option>
//     </select>
//   </FormField>
//
// NOTE: For Input, pass the error message string directly from Zod:
//   error={errors.name?.message}

export default function FormField({
  label,
  error,
  required = false,
  helper,
  children,
  style: extraStyle = {},
}) {
  const errorMsg = typeof error === 'string' ? error : error?.message

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...extraStyle,
    }}>
      {label && (
        <label style={{
          fontSize: 13,
          fontWeight: 600,
          color: errorMsg ? 'var(--danger-text, #EF4444)' : 'var(--text-secondary)',
          letterSpacing: '0.02em',
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {label}
          {required && (
            <span style={{ color: 'var(--danger-text)', fontSize: 13 }} aria-hidden="true">*</span>
          )}
        </label>
      )}

      {/* Child input — rendered as-is */}
      {children}

      {/* Error or helper */}
      {(errorMsg || helper) && (
        <p style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 400,
          color: errorMsg ? 'var(--danger-text, #EF4444)' : 'var(--text-muted)',
          lineHeight: 1.4,
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
        }}>
          {errorMsg || helper}
        </p>
      )}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { selectStyle, textareaStyle } from './formStyles'
