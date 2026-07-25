// src/features/purchases/components/AddSupplierModal.jsx
//
// "Add New Supplier" mini-modal shown during purchase creation.
// Purely presentational — all state lives in CreatePurchasePage.
//
// Props:
//   open            — boolean
//   onClose         — () => void
//   name            — string  (newSuppName)
//   phone           — string  (newSuppPhone)
//   email           — string  (newSuppEmail)
//   country         — string  (newSuppCountry)
//   state           — string  (newSuppState)
//   loading         — boolean (addSuppLoading)
//   onNameChange    — (value: string) => void
//   onPhoneChange   — (value: string) => void
//   onEmailChange   — (value: string) => void
//   onCountryChange — (value: string) => void  (also resets state to '')
//   onStateChange   — (value: string) => void
//   onSubmit        — () => void  (handleAddNewSupplierSubmit)
//
// Mirrors AddCustomerModal.jsx (sales) — zero behaviour change.

import { Modal, Button, FormField } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import StateDropdown from '../../../shared/components/StateDropdown';
import { COUNTRIES } from '../../../shared/data/countries';

export default function AddSupplierModal({
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
      title="Add New Supplier"
      subtitle="Quickly add a supplier and select them for this purchase"
      size="sm"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Full Name *">
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Supplier name"
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
