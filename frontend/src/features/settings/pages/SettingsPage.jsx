// FIX (2026-07-18): Subscription date display
//   Same fix as SubscriptionPage — trial/subscription end dates gated on
//   subscription_type to prevent both dates showing simultaneously.

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'

import {
  Button, Input, BentoCard, FormField,
} from '../../../shared/components'
import { selectStyle } from '../../../shared/components/FormField'
import { Spinner } from '../../../shared/components'
import { COUNTRIES } from '../../../shared/data/countries'
import { useBusiness, useUpdateBusiness } from '../hooks/useSettings'
import { businessSchema } from '../schemas/businessSchema'
import { useSubscription } from '../../subscription/hooks/useSubscription'
import { SUBSCRIPTION_DISPLAY_NAMES as DISPLAY_NAMES } from '../../../shared/utils/subscriptionUtils'
import { formatDate } from '../../../shared/utils/formatDate'
import { getTaxLabel } from '../../../shared/utils/formatTax'

const BASE_TABS = [
  { key: 'general', label: 'Business Info' },
  { key: 'tax', label: 'Tax Settings' },
  { key: 'pricing', label: 'Pricing & Plans' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('general')

  const { data, isLoading, isError } = useBusiness()
  const { mutate: save, isPending: isSaving } = useUpdateBusiness()
  const { data: sub, isLoading: subLoading } = useSubscription()

  const business = data?.data ?? data

  // FIX: Tax Settings tab shown for ALL countries. Labels inside the tab
  // use getTaxLabel() for country-appropriate text (GST, VAT, Sales Tax, etc.)
  const country = business?.business_country_code || ''
  const isGstRegistered = business?.is_gst_registered || false
  const taxLabel = getTaxLabel(country, isGstRegistered)
  const tabs = BASE_TABS

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      business_name: '',
      business_email: '',
      business_phone: '',
      business_address: '',
      business_state: '',
      business_country_code: '',
      gstin: '',
      is_gst_registered: false,
    },
  })

  const isGstRegistered = watch('is_gst_registered')

  useEffect(() => {
    if (business) {
      reset({
        business_name: business.business_name || '',
        business_email: business.business_email || '',
        business_phone: business.business_phone || '',
        business_address: business.business_address || '',
        business_state: business.business_state || '',
        business_country_code: business.business_country_code || '',
        gstin: business.gstin || '',
        is_gst_registered: business.is_gst_registered ?? false,
      })
    }
  }, [business, reset])

  function onSubmit(formData) {
    const payload = {}
    if (formData.business_name) payload.business_name = formData.business_name
    if (formData.business_phone) payload.business_phone = formData.business_phone
    if (formData.business_address) payload.business_address = formData.business_address
    if (formData.gstin) payload.gstin = formData.gstin
    payload.is_gst_registered = formData.is_gst_registered
    save(payload)
  }

  const safeActiveTab = tabs.some(t => t.key === activeTab) ? activeTab : 'general'

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 400 }}>
          Manage your business profile and preferences
        </p>
      </div>

      <BentoCard padding={false}>
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-page)',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '14px 24px',
                background: 'none', border: 'none',
                borderBottom: safeActiveTab === tab.key ? '2px solid var(--accent-600)' : '2px solid transparent',
                color: safeActiveTab === tab.key ? 'var(--accent-600)' : 'var(--text-muted)',
                fontWeight: safeActiveTab === tab.key ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 0.12s, border-color 0.12s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 28 }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size="md" />
            </div>
          ) : isError ? (
            <div style={{
              padding: '18px 16px',
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              borderRadius: 12, fontSize: 13,
              color: 'var(--danger-text)', fontWeight: 500,
            }}>
              Could not load business settings. Check that the backend is running and refresh.
            </div>
          ) : activeTab === 'pricing' ? (
            <div>
              {subLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                  <Spinner size="md" />
                </div>
              ) : (
                <>
                  <p style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                    margin: '0 0 20px',
                  }}>
                    Current Plan
                  </p>

                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 20,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: 'var(--accent-50)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>

                    <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                      {sub ? (DISPLAY_NAMES[sub.subscription_type] || 'Trial') : 'Trial'}
                    </h2>
                    <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {sub?.is_expired
                        ? 'Your subscription has expired. Renew to continue using all features.'
                        : 'Your plan is active.'}
                    </p>

                    <div style={{
                      display: 'flex', justifyContent: 'center', gap: 28,
                      flexWrap: 'wrap', marginBottom: 24,
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Status</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: sub?.is_expired ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {sub?.payment_status === 'paid' ? 'Active' : sub?.payment_status || '—'}
                        </div>
                      </div>
                      {sub?.subscription_type === 'trial' && sub?.trial_end_at && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Trial Ends</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatDate(sub.trial_end_at)}
                          </div>
                        </div>
                      )}
                      {sub?.subscription_type !== 'trial' && sub?.subscription_end_at && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Subscription Ends</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatDate(sub.subscription_end_at)}
                          </div>
                        </div>
                      )}
                      {sub?.days_remaining !== null && sub?.days_remaining !== undefined && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Days Remaining</div>
                          <div style={{
                            fontSize: 14, fontWeight: 600,
                            color: sub.days_remaining <= 7 ? 'var(--danger)' : 'var(--text-primary)',
                          }}>
                            {sub.days_remaining}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button variant="primary" onClick={() => navigate('/subscription')}>
                      View all plans
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {activeTab === 'general' && (
                <div>
                  <p style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                    margin: '0 0 20px',
                  }}>
                    General Information
                  </p>

                  <FormField label="Business Name" error={errors.business_name?.message} required style={{ marginBottom: 16 }}>
                    <Input
                      {...register('business_name')}
                      placeholder="e.g. ABC Enterprises"
                      autoFocus
                    />
                  </FormField>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <FormField label="Email Address" error={errors.business_email?.message}>
                      <Input {...register('business_email')} disabled placeholder="e.g. hello@abc.com" type="email" />
                    </FormField>
                    <FormField label="Phone Number" error={errors.business_phone?.message}>
                      <Input {...register('business_phone')} placeholder="e.g. +91 98765 43210" type="tel" />
                    </FormField>
                  </div>

                  <FormField label="Address" error={errors.business_address?.message} style={{ marginBottom: 16 }}>
                    <textarea
                      {...register('business_address')}
                      placeholder="Street address, area, city..."
                      rows={3}
                      style={{
                        ...selectStyle,
                        resize: 'vertical', minHeight: 72,
                        fontFamily: "var(--font-sans, 'Inter', sans-serif)",
                      }}
                    />
                  </FormField>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <FormField label="State / Province" error={errors.business_state?.message}>
                      <Input {...register('business_state')} disabled placeholder="e.g. Tamil Nadu" />
                    </FormField>
                    <FormField label="Country" error={errors.business_country_code?.message}>
                      <select {...register('business_country_code')} disabled className="sb-select" style={selectStyle} aria-label="Business country">
                        <option value="">— Select Country —</option>
                        {COUNTRIES.map((c) => (
                          <option
                            key={c.value || c.label}
                            value={c.value}
                            disabled={c.disabled}
                            style={c.disabled ? { color: 'var(--text-muted)' } : {}}
                          >
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                </div>
              )}

              {activeTab === 'tax' && (
                <div>
                  <p style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                    margin: '0 0 20px',
                  }}>
                    {taxLabel} Configuration
                  </p>

                  <div style={{
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '16px 20px',
                    marginBottom: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                        {taxLabel} Registered
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {country !== 'IN'
                          ? `${taxLabel} registration is only available for Indian businesses`
                          : `Enable if your business is registered for ${taxLabel}`
                        }
                      </div>
                    </div>
                    <label style={{
                      position: 'relative', display: 'inline-block',
                      width: 44, height: 24, cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        {...register('is_gst_registered')}
                        disabled={country !== 'IN'}
                        style={{ opacity: 0, width: 0, height: 0 }}
                        aria-label={`${taxLabel} registered`}
                      />
                      <span style={{
                        position: 'absolute', inset: 0,
                        background: country !== 'IN' ? 'var(--bg-muted)' : isGstRegistered ? 'var(--accent-600)' : 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 24,
                        transition: '0.2s',
                        opacity: country !== 'IN' ? 0.5 : 1,
                      }}>
                        <span style={{
                          position: 'absolute', top: 2,
                          left: isGstRegistered ? 24 : 2,
                          width: 18, height: 18, borderRadius: '50%',
                          background: isGstRegistered ? '#fff' : 'var(--text-muted)',
                          transition: '0.2s',
                        }} />
                      </span>
                    </label>
                  </div>

                  <FormField label={country === 'IN' ? 'GSTIN' : `${taxLabel} Number`} error={errors.gstin?.message} style={{ marginBottom: 16 }}>
                    <Input
                      {...register('gstin')}
                      placeholder={country === 'IN' ? 'e.g. 33AABCU9603R1ZM' : `e.g. Tax ID`}
                      style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}
                    />
                  </FormField>
                </div>
              )}

              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                paddingTop: 20, borderTop: '1px solid var(--border)', marginTop: 20,
              }}>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => reset()}
                  disabled={!isDirty || isSaving}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSaving}
                  disabled={!isDirty}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </div>
      </BentoCard>
    </>
  )
}
