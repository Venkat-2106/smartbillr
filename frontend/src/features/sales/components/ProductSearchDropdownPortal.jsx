// src/features/sales/components/ProductSearchDropdownPortal.jsx
//
// Renders a floating dropdown panel anchored to a ref's bounding rect,
// escaping any ancestor `overflow: auto` clipping via a document.body portal.
// Repositions on scroll/resize while open.
//
// Extracted from CreateSalePage.jsx (Step 5.16 refactor) — zero behaviour change.

import { useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ProductSearchDropdownPortal({ anchorRef, children }) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      setRect(el.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  if (!rect) return null;

  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

  const style = {
    position: 'fixed',
    left: rect.left,
    width: rect.width,
    ...(openUp
      ? { bottom: window.innerHeight - rect.top + 3 }
      : { top: rect.bottom + 3 }),
    zIndex: 1000,
  };

  return createPortal(
    <div style={style}>{children}</div>,
    document.body
  );
}