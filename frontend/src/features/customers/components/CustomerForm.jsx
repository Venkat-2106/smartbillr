// src/features/customers/components/CustomerForm.jsx
//
// Isolated form component — owns its own RHF instance.
// Extracted from CustomersPage to:
//   1. Prevent the giant page from re-rendering when form state changes
//   2. Keep COUNTRY_CODES / STATES_BY_COUNTRY data out of the page render scope
//   3. Make the form unit-testable independently

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Button, Modal, Input, FormField, selectStyle, textareaStyle } from '../../../shared/components'

// ── Zod schema ────────────────────────────────────────────────────────────────
export const customerSchema = z.object({
  cust_name:         z.string().min(1, 'Name is required').max(150).trim(),
  cust_phone:        z.string().max(20).trim().optional().or(z.literal('')),
  cust_email:        z.string().email('Invalid email').optional().or(z.literal('')),
  cust_address:      z.string().max(300).trim().optional().or(z.literal('')),
  cust_state:        z.string().max(100).trim().optional().or(z.literal('')),
  cust_country_code: z.string().max(5).trim().optional().or(z.literal('')),
  cust_tax_number:   z.string().max(50).trim().optional().or(z.literal('')),
})

// ── Country list ──────────────────────────────────────────────────────────────
export const COUNTRY_CODES = [
  { code: 'AE', label: 'UAE (AE)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'BD', label: 'Bangladesh (BD)' },
  { code: 'BR', label: 'Brazil (BR)' },
  { code: 'CA', label: 'Canada (CA)' },
  { code: 'DE', label: 'Germany (DE)' },
  { code: 'EG', label: 'Egypt (EG)' },
  { code: 'FR', label: 'France (FR)' },
  { code: 'GB', label: 'UK (GB)' },
  { code: 'GH', label: 'Ghana (GH)' },
  { code: 'ID', label: 'Indonesia (ID)' },
  { code: 'IN', label: 'India (IN)' },
  { code: 'JP', label: 'Japan (JP)' },
  { code: 'KE', label: 'Kenya (KE)' },
  { code: 'LK', label: 'Sri Lanka (LK)' },
  { code: 'MX', label: 'Mexico (MX)' },
  { code: 'MY', label: 'Malaysia (MY)' },
  { code: 'NG', label: 'Nigeria (NG)' },
  { code: 'NZ', label: 'New Zealand (NZ)' },
  { code: 'PH', label: 'Philippines (PH)' },
  { code: 'PK', label: 'Pakistan (PK)' },
  { code: 'SA', label: 'Saudi Arabia (SA)' },
  { code: 'SG', label: 'Singapore (SG)' },
  { code: 'TZ', label: 'Tanzania (TZ)' },
  { code: 'UG', label: 'Uganda (UG)' },
  { code: 'US', label: 'USA (US)' },
  { code: 'ZA', label: 'South Africa (ZA)' },
]

export const COUNTRY_MAP = Object.fromEntries(COUNTRY_CODES.map(c => [c.code, c.label]))

// ── States per country ────────────────────────────────────────────────────────
export const STATES_BY_COUNTRY = {
  IN: ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman & Nicobar Islands','Chandigarh','Dadra & Nagar Haveli and Daman & Diu','Delhi','Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry'],
  US: ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'],
  CA: ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon'],
  AU: ['Australian Capital Territory','New South Wales','Northern Territory','Queensland','South Australia','Tasmania','Victoria','Western Australia'],
  GB: ['England','Scotland','Wales','Northern Ireland'],
  AE: ['Abu Dhabi','Ajman','Dubai','Fujairah','Ras Al Khaimah','Sharjah','Umm Al Quwain'],
  MY: ['Johor','Kedah','Kelantan','Kuala Lumpur','Labuan','Malacca','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Putrajaya','Sabah','Sarawak','Selangor','Terengganu'],
  PK: ['Azad Kashmir','Balochistan','Gilgit-Baltistan','Islamabad Capital Territory','Khyber Pakhtunkhwa','Punjab','Sindh'],
  BD: ['Barishal','Chattogram','Dhaka','Khulna','Mymensingh','Rajshahi','Rangpur','Sylhet'],
  BR: ['Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal','Espírito Santo','Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Pará','Paraíba','Paraná','Pernambuco','Piauí','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia','Roraima','Santa Catarina','São Paulo','Sergipe','Tocantins'],
  MX: ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'],
  ZA: ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'],
  NG: ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'],
  ID: ['Aceh','Bali','Bangka Belitung','Banten','Bengkulu','Central Java','Central Kalimantan','Central Sulawesi','East Java','East Kalimantan','East Nusa Tenggara','Gorontalo','Jakarta','Jambi','Lampung','Maluku','North Kalimantan','North Maluku','North Sulawesi','North Sumatra','Papua','Riau','Riau Islands','South Kalimantan','South Sulawesi','South Sumatra','Southeast Sulawesi','Special Region of Yogyakarta','West Java','West Kalimantan','West Nusa Tenggara','West Papua','West Sulawesi','West Sumatra'],
  PH: ['Abra','Agusan del Norte','Agusan del Sur','Aklan','Albay','Antique','Apayao','Aurora','Basilan','Bataan','Batanes','Batangas','Benguet','Biliran','Bohol','Bukidnon','Bulacan','Cagayan','Camarines Norte','Camarines Sur','Camiguin','Capiz','Catanduanes','Cavite','Cebu','Cotabato','Davao de Oro','Davao del Norte','Davao del Sur','Davao Occidental','Davao Oriental','Dinagat Islands','Eastern Samar','Guimaras','Ifugao','Ilocos Norte','Ilocos Sur','Iloilo','Isabela','Kalinga','La Union','Laguna','Lanao del Norte','Lanao del Sur','Leyte','Maguindanao','Marinduque','Masbate','Metro Manila','Misamis Occidental','Misamis Oriental','Mountain Province','Negros Occidental','Negros Oriental','Northern Samar','Nueva Ecija','Nueva Vizcaya','Occidental Mindoro','Oriental Mindoro','Palawan','Pampanga','Pangasinan','Quezon','Quirino','Rizal','Romblon','Samar','Sarangani','Siquijor','Sorsogon','South Cotabato','Southern Leyte','Sultan Kudarat','Sulu','Surigao del Norte','Surigao del Sur','Tarlac','Tawi-Tawi','Zambales','Zamboanga del Norte','Zamboanga del Sur','Zamboanga Sibugay'],
  LK: ['Central','Eastern','North Central','North Western','Northern','Sabaragamuwa','Southern','Uva','Western'],
  KE: ['Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa',"Murang'a",'Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi','Trans-Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot'],
}

// ── State Field subcomponent ──────────────────────────────────────────────────
function StateField({ register, selectedCountry }) {
  const states = STATES_BY_COUNTRY[selectedCountry] ?? null
  if (states) {
    return (
      <select {...register('cust_state')} style={selectStyle}>
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
          <select {...register('cust_country_code')} style={selectStyle}>
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
