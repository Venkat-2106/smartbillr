// src/features/customers/components/CustomerForm.jsx
//
// Isolated form component — owns its own RHF instance.
// Extracted from CustomersPage to:
//   1. Prevent the giant page from re-rendering when form state changes
//   2. Keep COUNTRY_CODES / STATES_BY_COUNTRY data out of the page render scope
//   3. Make the form unit-testable independently

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button, Modal, Input, FormField, selectStyle, textareaStyle } from '../../../shared/components'

import { customerSchema } from '../schemas/customerSchema'
import { COUNTRY_CODES, STATES_BY_COUNTRY } from './countryData'

// ── State Field subcomponent ──────────────────────────────────────────────────
function StateField({ register, selectedCountry }) {
  const states = STATES_BY_COUNTRY[selectedCountry] ?? null
  if (states) {
    return (
      <select {...register('cust_state')} className="sb-select" style={selectStyle}>
        <option value="">Select state / province</option>
        {states.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    )
  }
  return (
    <Input
      placeholder={selectedCountry ? 'Enter state / province' : 'Select country first'}
      {...register('cust_state')}
    />
  )
}

// ── CustomerForm ──────────────────────────────────────────────────────────────
export default function CustomerForm({ defaultValues = {}, onSubmit, onClose, isPending }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues,
  })

  const selectedCountry = useWatch({
    control,
    name: 'cust_country_code',
    defaultValue: defaultValues.cust_country_code || '',
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Customer Name" error={errors.cust_name} required>
            <Input placeholder="e.g. Ravi Kumar" autoFocus {...register('cust_name')} />
          </FormField>
        </div>

        <FormField label="Phone" error={errors.cust_phone}>
          <Input placeholder="e.g. 9876543210" type="tel" {...register('cust_phone')} />
        </FormField>

        <FormField label="Email" error={errors.cust_email}>
          <Input placeholder="e.g. ravi@example.com" type="email" {...register('cust_email')} />
        </FormField>

        <FormField label="Country" error={errors.cust_country_code}>
          <select {...register('cust_country_code')} className="sb-select" style={selectStyle}>
            <option value="">Select country</option>
            {COUNTRY_CODES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </FormField>

        <FormField
          label="State / Province"
          error={errors.cust_state}
          helper={STATES_BY_COUNTRY[selectedCountry] ? 'Based on selected country' : undefined}
        >
          <StateField register={register} selectedCountry={selectedCountry} />
        </FormField>

        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Tax Number (GSTIN / VAT / TIN)" error={errors.cust_tax_number}>
            <Input placeholder="e.g. 29ABCDE1234F1Z5" {...register('cust_tax_number')} />
          </FormField>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Address" error={errors.cust_address}>
            <textarea
              placeholder="Full address..."
              style={textareaStyle}
              {...register('cust_address')}
            />
          </FormField>
        </div>
      </div>

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isPending}>Save</Button>
      </Modal.Footer>
    </form>
  )
}
