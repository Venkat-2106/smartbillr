import React from 'react';
import {
  XMarkIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  IdentificationIcon,
  CalendarDaysIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

// Local date formatter
const fmtDate = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export default function SupplierDetailDrawer({ supplier, onClose }) {
  if (!supplier) return null;

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1000,
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* ── Drawer panel ──────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, right: 0,
        height: '100vh', width: 420, maxWidth: '95vw',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '22px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BuildingOfficeIcon style={{ width: 24, height: 24, color: '#fff' }} />
            </div>
            <div>
              <h2 style={{
                fontSize: 16, fontWeight: 700,
                color: 'var(--text-primary)', margin: 0, lineHeight: 1.3,
              }}>
                {supplier.supp_name}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                Supplier Profile
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-page)', border: '1px solid var(--border)',
              cursor: 'pointer', padding: 6, borderRadius: 8,
              color: 'var(--text-muted)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <XMarkIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          <DrawerSection title="Contact Information">
            <InfoRow icon={<PhoneIcon />}    label="Phone"
              value={supplier.supp_phone || '—'} />
            <InfoRow icon={<EnvelopeIcon />} label="Email"
              value={supplier.supp_email || '—'} />
            <InfoRow icon={<MapPinIcon />}   label="Address"
              value={supplier.supp_address || '—'} />
            <InfoRow icon={<MapPinIcon />}   label="State / Province"
              value={supplier.supp_state || '—'} />
            <InfoRow icon={<MapPinIcon />}   label="Country"
              value={supplier.supp_country_code || '—'} isLast />
          </DrawerSection>

          {supplier.supp_tax_number && (
            <DrawerSection title="Tax Information">
              <InfoRow icon={<IdentificationIcon />}
                label="Tax / GSTIN / VAT"
                value={supplier.supp_tax_number}
                isLast
              />
            </DrawerSection>
          )}

          <DrawerSection title="Record Information">
            <InfoRow icon={<CalendarDaysIcon />} label="Added On"
              value={fmtDate(supplier.supp_created_at)} />
            <InfoRow icon={<CalendarDaysIcon />} label="Last Updated"
              value={fmtDate(supplier.updated_at)} />
            <InfoRow icon={<UserIcon />}          label="Last Updated By"
              value={supplier.last_updated_by || '—'} isLast />
          </DrawerSection>

        </div>
      </div>
    </>
  );
}

/* ─── Helper sub-components ─────────────────────────────────────────────── */

function DrawerSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-muted)',
        margin: '0 0 10px',
      }}>
        {title}
      </p>
      <div style={{
        background: 'var(--bg-page)',
        border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, isLast = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      {icon && (
        <span style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }}>
          {React.cloneElement(icon, { style: { width: 15, height: 15 } })}
        </span>
      )}
      <span style={{
        fontSize: 12.5, color: 'var(--text-muted)',
        minWidth: 130, fontWeight: 500, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, color: 'var(--text-primary)',
        fontWeight: 500, flex: 1, textAlign: 'right',
        wordBreak: 'break-word',
      }}>
        {value}
      </span>
    </div>
  );
}