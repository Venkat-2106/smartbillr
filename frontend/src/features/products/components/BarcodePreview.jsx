// src/features/products/components/BarcodePreview.jsx
//
// Live SVG preview of the barcode field, shown inside Add/Edit Product
// modals next to the Barcode input. Renders whenever the current value is
// scannable (EAN-13 or CODE128 fallback); hidden when the field is empty or
// unrenderable so users never see a broken label before printing.
//
// All rendering logic lives in barcodeRender.js — this component stays dumb.
// Value flow: react-hook-form's watch('barcode') picks up typing, Generate,
// and blur alike.

import { useEffect, useRef } from 'react'
import { renderBarcode, isRenderableBarcode } from './barcodeRender'

export default function BarcodePreview({ value }) {
  const svgRef = useRef(null)
  const trimmed = String(value ?? '').trim()
  const visible = isRenderableBarcode(trimmed)

  useEffect(() => {
    if (visible && svgRef.current) renderBarcode(svgRef.current, trimmed)
  }, [trimmed, visible])

  if (!trimmed || !visible) return null

  return (
    <div style={{
      marginTop: 10,
      padding: '10px 8px 6px',
      background: 'var(--bg-page)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      textAlign: 'center',
    }}>
      <svg ref={svgRef} style={{ maxWidth: '100%', height: 'auto' }} />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        Label preview — how the printed barcode will look
      </div>
    </div>
  )
}
