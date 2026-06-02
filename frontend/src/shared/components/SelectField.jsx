// src/shared/components/SelectField.jsx
//
// Modern styled select dropdown to replace all raw <select style={selectStyle}> usages.
//
// REPLACES: selectStyle from FormField.jsx (still exported for backward compat)
//
// USAGE:
//   import SelectField from '../../../shared/components/SelectField';
//
//   <SelectField
//     value={status}
//     onChange={e => setStatus(e.target.value)}
//     options={[
//       { value: 'paid',    label: 'Paid' },
//       { value: 'partial', label: 'Partial' },
//       { value: 'pending', label: 'Unpaid' },
//     ]}
//     placeholder="Select status"
//   />
//
// OR with a React Hook Form register:
//   <SelectField {...register('payment_method')} options={PAYMENT_OPTIONS} />

import React, { useState } from 'react';

export default function SelectField({
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
  error = false,
  size = 'md',           // 'sm' | 'md' | 'lg'
  style: extraStyle = {},
  className,
  ...rest
}) {
  const [focused, setFocused] = useState(false);

  const sizes = {
    sm: { padding: '6px 32px 6px 10px', fontSize: 12.5, height: 32 },
    md: { padding: '9px 36px 9px 12px', fontSize: 13.5, height: 38 },
    lg: { padding: '11px 40px 11px 14px', fontSize: 14.5, height: 44 },
  };

  const s = sizes[size] || sizes.md;

  const borderColor = error
    ? 'var(--danger-border, #FCA5A5)'
    : focused
    ? 'var(--accent-500)'
    : 'var(--border)';

  const boxShadow = focused
    ? `0 0 0 3px ${error ? 'rgba(239,68,68,0.12)' : 'var(--accent-ring)'}`
    : 'none';

  return (
    <div style={{ position: 'relative', width: '100%', ...extraStyle }}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={className}
        style={{
          width: '100%',
          height: s.height,
          padding: s.padding,
          background: disabled ? 'var(--bg-subtle)' : 'var(--bg-card)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 10,
          fontSize: s.fontSize,
          fontWeight: 500,
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          boxShadow,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          // Custom chevron — uses accent color
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236366F1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '16px 16px',
        }}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}