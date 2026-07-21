// shared/components/StateDropdown.jsx
//
// Smart state/province input component.
//
// WHAT IT DOES:
//   - If `countryCode` maps to a state list → shows a styled <select> dropdown
//   - If `countryCode` is unknown or has no states → shows a text <input>
//   - If `countryCode` is null/empty → shows a disabled placeholder
//
// DESIGNED FOR React Hook Form (RHF) integration.
// The component accepts a value + onChange interface so it works cleanly
// with setValue() and watch() from useForm().
//
// UI/UX AUDIT (2026-07-18) — Finding #12:
//   Used by SignupPage to replace ~70 lines of local country/state data with
//   the shared COUNTRY_STATES module. Handles empty-state countries (Singapore,
//   Japan, etc.) via text-input fallback automatically.
//   See UI_UX_AUDIT_REPORT.md
//
// USAGE IN A FORM (with React Hook Form):
//
//   const { watch, setValue, formState: { errors } } = useForm()
//   const countryCode = watch('cust_country_code')
//
//   // When country changes, reset the state field
//   useEffect(() => {
//     setValue('cust_state', '')
//   }, [countryCode, setValue])
//
//   <StateDropdown
//     countryCode={countryCode}
//     value={watch('cust_state')}
//     onChange={(val) => setValue('cust_state', val)}
//     error={errors.cust_state?.message}
//   />
//
// STANDALONE USAGE (no React Hook Form):
//
//   const [state, setState] = useState('')
//   const [country, setCountry] = useState('IN')
//
//   <StateDropdown
//     countryCode={country}
//     value={state}
//     onChange={(val) => setState(val)}
//   />

import { getStatesForCountry } from '../data/countryStates';

// Import selectStyle from where you store it.
// If it's still in FormField.jsx, import from there:
import FormField, { selectStyle } from './FormField';

// Import the Input component for the text fallback
import Input from './Input';


/**
 * StateDropdown
 *
 * @param {string}   countryCode  - ISO country code (e.g. 'IN', 'US'). Controls dropdown vs text.
 * @param {string}   value        - Current selected/entered state value (controlled)
 * @param {Function} onChange     - Called with the new state string when user selects/types
 * @param {string}   [label]      - Field label (default: "State / Province")
 * @param {string}   [error]      - Validation error message to display below the field
 * @param {boolean}  [required]   - Whether the field is required (adds * to label)
 * @param {string}   [placeholder]- Custom placeholder for text input fallback
 */
export default function StateDropdown({
  countryCode,
  value,
  onChange,
  label = 'State / Province',
  error,
  required = false,
  placeholder,
}) {
  const states = getStatesForCountry(countryCode);
  const hasStates = states.length > 0;

  // ── CASE 1: No country selected ──────────────────────────────────────────
  // Show a disabled text input with a helpful prompt
  if (!countryCode) {
    return (
      <FormField label={label} error={error} required={required}>
        <Input
          value=""
          onChange={() => {}}
          placeholder="Select a country first"
          disabled
        />
      </FormField>
    );
  }

  // ── CASE 2: Country has a state list → show dropdown ─────────────────────
  if (hasStates) {
    return (
      <FormField label={label} error={error} required={required}>
        <select
          className="sb-select"
          style={{
            ...selectStyle,
            // Use border shorthand (not borderColor) to avoid React shorthand/longhand conflict
            ...(error ? { border: '1.5px solid var(--color-red)' } : {}),
          }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Select {label} —</option>
          {states.map((state) => (
            <option key={state.code} value={state.name}>
              {state.name}
            </option>
          ))}
        </select>
      </FormField>
    );
  }

  // ── CASE 3: Country not in our list or has empty state array ─────────────
  // Graceful fallback to free-text input
  return (
    <FormField label={label} error={error} required={required}>
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || `Enter ${label}`}
      />
    </FormField>
  );
}