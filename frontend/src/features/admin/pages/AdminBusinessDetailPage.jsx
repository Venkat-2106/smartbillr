import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button, Badge, ConfirmDialog } from '../../../shared/components'
import api from '../../../api/axios'

const PLAN_OPTIONS = ['trial', 'monthly', 'annual', 'lifetime']
const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'suspended']

export default function AdminBusinessDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [biz, setBiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSuspend, setShowSuspend] = useState(false)

  const [editPlan, setEditPlan] = useState('')
  const [editPayment, setEditPayment] = useState('')
  const [editEndAt, setEditEndAt] = useState('')

  const fetchBusiness = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.get(`/superadmin/businesses/${id}`)
      const d = resp.data
      setBiz(d)
      setEditPlan(d.subscription_type || 'trial')
      setEditPayment(d.payment_status || 'pending')
      setEditEndAt(d.subscription_end_at ? d.subscription_end_at.slice(0, 16) : '')
    } catch {
      toast.error('Business not found')
      navigate('/admin/businesses')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchBusiness() }, [fetchBusiness])

  async function handleSaveSubscription() {
    setSaving(true)
    try {
      const body = { subscription_type: editPlan, payment_status: editPayment }
      if (editEndAt) {
        body.subscription_end_at = new Date(editEndAt).toISOString()
      }
      await api.patch(`/superadmin/businesses/${id}/subscription`, body)
      toast.success('Subscription updated')
      await fetchBusiness()
    } catch {
      toast.error('Failed to update subscription')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    try {
      await api.patch(`/superadmin/businesses/${id}/status`, null, {
        params: { is_active: !biz.is_active },
      })
      toast.success(biz.is_active ? 'Business suspended' : 'Business reactivated')
      setShowSuspend(false)
      await fetchBusiness()
    } catch {
      toast.error('Failed to update status')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div style={{ color: '#94A3B8' }}>Loading...</div>
      </div>
    )
  }

  if (!biz) return null

  const row = (label, val) => (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ width: 180, fontSize: '0.78rem', color: '#94A3B8', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.82rem', color: '#F8FAFC', fontWeight: 500 }}>{val || '—'}</span>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/admin/businesses')}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94A3B8', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
            {biz.business_name}
          </h1>
          <p style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
            {biz.business_id}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Business Info */}
        <div style={{
          background: '#1E293B', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)', padding: '1.25rem',
        }}>
          <h2 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F8FAFC', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Business Details
          </h2>
          {row('Name', biz.business_name)}
          {row('Email', biz.business_email)}
          {row('Phone', biz.business_phone)}
          {row('GSTIN', biz.gstin)}
          {row('State', biz.business_state)}
          {row('Country', biz.business_country_code)}
          {row('Created', biz.created_at ? new Date(biz.created_at).toLocaleDateString() : '—')}
          {row('Status', biz.is_active
            ? <Badge variant="success" label="Active" />
            : <Badge variant="danger" label="Suspended" />
          )}
        </div>

        {/* Owner Info */}
        <div style={{
          background: '#1E293B', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)', padding: '1.25rem',
        }}>
          <h2 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F8FAFC', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Owner
          </h2>
          {biz.owner ? (
            <>
              {row('Name', biz.owner.full_name)}
              {row('Email', biz.owner.email)}
              {row('Role', <Badge status={biz.owner.role} />)}
            </>
          ) : (
            <p style={{ color: '#64748B', fontSize: '0.8rem' }}>No owner profile found</p>
          )}
        </div>

        {/* Subscription Management */}
        <div style={{
          background: '#1E293B', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)', padding: '1.25rem',
          gridColumn: '1 / -1',
        }}>
          <h2 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F8FAFC', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Subscription
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600, marginBottom: 4 }}>Plan</label>
              <select
                value={editPlan}
                onChange={e => setEditPlan(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F8FAFC', fontSize: '0.8rem', fontFamily: 'inherit',
                }}
              >
                {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600, marginBottom: 4 }}>Payment Status</label>
              <select
                value={editPayment}
                onChange={e => setEditPayment(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F8FAFC', fontSize: '0.8rem', fontFamily: 'inherit',
                }}
              >
                {PAYMENT_STATUS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600, marginBottom: 4 }}>End Date</label>
              <input
                type="datetime-local"
                value={editEndAt}
                onChange={e => setEditEndAt(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F8FAFC', fontSize: '0.8rem', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button onClick={handleSaveSubscription} loading={saving} variant="primary">
              Save Changes
            </Button>
            <Button
              onClick={() => setShowSuspend(true)}
              variant={biz.is_active ? 'danger' : 'primary'}
            >
              {biz.is_active ? 'Suspend Business' : 'Reactivate Business'}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showSuspend}
        onClose={() => setShowSuspend(false)}
        onConfirm={handleToggleStatus}
        title={biz.is_active ? 'Suspend this business?' : 'Reactivate this business?'}
        message={biz.is_active
          ? 'All staff will lose access until the business is reactivated.'
          : 'The business and all its staff will regain access.'}
        confirmText={biz.is_active ? 'Suspend' : 'Reactivate'}
        variant={biz.is_active ? 'danger' : 'warning'}
      />
    </div>
  )
}
