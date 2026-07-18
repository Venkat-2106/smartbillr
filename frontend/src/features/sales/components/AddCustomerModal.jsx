// src/features/sales/components/AddCustomerModal.jsx
//
// "Add New Customer" mini-modal shown during invoice creation.
// Purely presentational — all state lives in CreateSalePage (hooks own state rule).
//
// Props:
//   open            — boolean
//   onClose         — () => void
//   name            — string  (newCustName)
//   phone           — string  (newCustPhone)
//   email           — string  (newCustEmail)
//   country         — string  (newCustCountry)
//   state           — string  (newCustState)
//   loading         — boolean (addCustLoading)
//   onNameChange    — (value: string) => void
//   onPhoneChange   — (value: string) => void
//   onEmailChange   — (value: string) => void
//   onCountryChange — (value: string) => void  (also resets state to '')
//   onStateChange   — (value: string) => void
//   onSubmit        — () => void  (handleAddNewCustomer)
//
// Extracted from CreateSalePage.jsx (Step 5.16 refactor) — zero behaviour change.

import { Modal, Button, FormField } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import StateDropdown from '../../../shared/components/StateDropdown';
import { COUNTRIES } from '../../../shared/data/countries';

export default function AddCustomerModal({
  open,
  onClose,
  name,
  phone,
  email,
  country,
  state,
  loading,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onCountryChange,
  onStateChange,
  onSubmit,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Customer"
      subtitle="Quickly add a customer and select them for this invoice"
      size="sm"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Full Name *">
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Customer name"
            autoFocus
            style={{ ...selectStyle }}
          />
        </FormField>
        <FormField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={e => onPhoneChange(e.target.value)}
            placeholder="Phone number (optional)"
            style={{ ...selectStyle }}
          />
        </FormField>
        <FormField label="Email">
          <input
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="Email address (optional)"
            style={{ ...selectStyle }}
          />
        </FormField>
        <FormField label="Country">
          <select
            value={country}
            onChange={e => onCountryChange(e.target.value)}
            className="sb-select"
            style={{ ...selectStyle }}
          >
            <option value="">— Select Country —</option>
            {COUNTRIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </FormField>
        <StateDropdown
          label="State / Province"
          countryCode={country}
          value={state}
          onChange={val => onStateChange(val)}
        />
      </div>
      <Modal.Footer>
        <Button
          variant="ghost"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          loading={loading}
          disabled={!name.trim()}
        >
          Create &amp; Select
        </Button>
      </Modal.Footer>
    </Modal>
  );
}