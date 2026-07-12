import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  createSale,
  fetchCustomersForSale,
  searchProductsLean,
  fetchProductByBarcode,
} from '../api/salesApi';
import { createCustomer } from '../../customers/api/customersApi';
import useAuthStore from '../../../store/authStore';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { getAutoPrintInvoice, setAutoPrintInvoice } from '../../../shared/utils/preferences';

const newItem = () => ({
  _id:        `${Date.now()}-${Math.random()}`,
  product_id: '',
  mrp:        0,
  unit_price: 0,
  quantity:   1,
  tax_rate:   0,
});

export default function useCreateSale() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const user        = useAuthStore((s) => s.user);
  const business    = useAuthStore((s) => s.business);

  // ── Form state ───────────────────────────────────────────────────────────
  const [customerId,    setCustomerId]    = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paidAmount,    setPaidAmount]    = useState('');
  const [items,         setItems]         = useState([newItem()]);
  const [autoPrint,     setAutoPrint]      = useState(() => getAutoPrintInvoice());

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Barcode state ─────────────────────────────────────────────────────────
  const [barcodeInput,   setBarcodeInput]   = useState('');
  const [barcodeError,   setBarcodeError]   = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeRef = useRef(null);
  const barcodeInputRef = useRef('');
  useEffect(() => { barcodeInputRef.current = barcodeInput; }, [barcodeInput]);

  // ── Per-item product search state ─────────────────────────────────────────
  const [searchMap,   setSearchMap]   = useState({});
  const [openDropMap, setOpenDropMap] = useState({});
  const [activeItemSearch, setActiveItemSearch] = useState('');
  const debouncedProductSearch = useDebounce(activeItemSearch, 150);

  // ── Add New Customer modal state ──────────────────────────────────────────
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCustName,      setNewCustName]      = useState('');
  const [newCustPhone,     setNewCustPhone]     = useState('');
  const [newCustEmail,     setNewCustEmail]     = useState('');
  const [newCustCountry,   setNewCustCountry]   = useState('');
  const [newCustState,     setNewCustState]     = useState('');
  const [addCustLoading,   setAddCustLoading]   = useState(false);

  // ── Stock override dialog state ───────────────────────────────────────────
  const [stockErrors,  setStockErrors]  = useState([]);
  const [pendingBody,  setPendingBody]  = useState(null);

  // ── Fetch customers ────────────────────────────────────────────────────────
  const { data: allCustomers = [], isLoading: loadingCust } = useQuery({
    queryKey: ['customers-for-sale'],
    queryFn:  fetchCustomersForSale,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  // ── Lean product search ────────────────────────────────────────────────────
  const { data: productSearchResults = [] } = useQuery({
    queryKey:        ['products-search-lean', debouncedProductSearch],
    queryFn:         () => searchProductsLean(debouncedProductSearch),
    enabled:         debouncedProductSearch.length >= 2,
    staleTime:       60 * 1000,
    placeholderData: (prev) => prev,
  });

  // ── Customer combobox handler ─────────────────────────────────────────────
  const handleCustomerChange = useCallback((customer) => {
    setCustomerId(customer ? customer.cust_id : '');
  }, []);

  // ── Add New Customer ───────────────────────────────────────────────────────
  const handleOpenAddCust = useCallback((searchText) => {
    setNewCustName(searchText || '');
    setNewCustPhone('');
    setNewCustEmail('');
    setNewCustCountry(business?.business_country_code || '');
    setNewCustState(business?.business_state || '');
    setShowAddCustModal(true);
  }, [business]);

  const handleCloseAddCustModal = useCallback(() => {
    setShowAddCustModal(false);
    setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
    setNewCustCountry(''); setNewCustState('');
  }, []);

  const handleAddNewCustomerSubmit = useCallback(async () => {
    const name = newCustName.trim();
    if (!name) {
      toast.error('Customer name is required');
      return;
    }
    setAddCustLoading(true);
    try {
      const res = await createCustomer({
        cust_name:         name,
        cust_phone:        newCustPhone.trim()   || undefined,
        cust_email:        newCustEmail.trim()   || undefined,
        cust_country_code: newCustCountry        || undefined,
        cust_state:        newCustState.trim()   || undefined,
      });
      const created = res.customer;
      setCustomerId(created.cust_id);
      queryClient.invalidateQueries({ queryKey: ['customers-for-sale'] });
      toast.success(`Customer "${created.cust_name}" created and selected`);
      setShowAddCustModal(false);
      setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
      setNewCustCountry(''); setNewCustState('');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create customer');
    } finally {
      setAddCustLoading(false);
    }
  }, [newCustName, newCustPhone, newCustEmail, newCustCountry, newCustState, queryClient]);

  // ── Barcode scan ─────────────────────────────────────────────────────────
  const handleBarcodeScan = useCallback(async (e) => {
    if (e.key !== 'Enter') return;
    const raw = barcodeInputRef.current.trim();
    if (!raw) return;

    let qty = 1, code = raw;
    const match = raw.match(/^(\d+)[×*x](.+)$/i);
    if (match) {
      qty  = Math.max(1, parseInt(match[1], 10));
      code = match[2].trim();
    }

    setBarcodeError('');
    setBarcodeInput('');
    setBarcodeLoading(true);

    try {
      const product = await fetchProductByBarcode(code);

      setItems(prev => {
        const emptyIdx = prev.findIndex(i => !i.product_id);
        const existingIdx = prev.findIndex(i => i.product_id === product.prod_id);

        if (existingIdx >= 0) {
          return prev.map(i =>
            i._id === prev[existingIdx]._id ? { ...i, quantity: i.quantity + qty } : i
          );
        }

        if (emptyIdx >= 0) {
          const filled = prev.map((i, idx) =>
            idx === emptyIdx
              ? {
                  ...i,
                  product_id:     product.prod_id,
                  prod_name:      product.prod_name,
                  mrp:            Number(product.prod_mrp) || 0,
                  unit_price:     Number(product.prod_sell_price) || 0,
                  quantity:       qty,
                  tax_rate:       Number(product.tax_rate) || 0,
                  prod_stock_qty: Number(product.prod_stock_qty) ?? null,
                }
              : i
          );
          return emptyIdx === prev.length - 1 ? [...filled, newItem()] : filled;
        }

        return [...prev, {
          _id:        `${Date.now()}-${Math.random()}`,
          product_id: product.prod_id,
          prod_name:  product.prod_name,
          mrp:        Number(product.prod_mrp) || 0,
          unit_price: Number(product.prod_sell_price) || 0,
          quantity:   qty,
          tax_rate:   Number(product.tax_rate) || 0,
          prod_stock_qty: Number(product.prod_stock_qty) ?? null,
        }, newItem()];
      });
      toast.success(`Added: ${product.prod_name}`, { duration: 1500 });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setBarcodeError(`No product found for barcode: ${code}`);
      } else {
        setBarcodeError('Barcode lookup failed. Try again.');
      }
    } finally {
      setBarcodeLoading(false);
      setTimeout(() => barcodeRef.current?.focus(), 50);
    }
  }, []);

  // ── Build mutation body ──────────────────────────────────────────────────
  const buildBody = useCallback((overrideFlag = false) => {
    const parsedPaid = Number(paidAmount) || 0;
    const body = {
      customer_id:          customerId || null,
      sales_payment_method: paymentMethod,
      sales_payment_status: paymentStatus,
      allow_stock_override: overrideFlag,
      items: items.map(i => ({
        product_id:           i.product_id,
        sale_item_quantity:   Number(i.quantity),
        sale_item_unit_price: Number(i.unit_price),
        tax_rate:             Number(i.tax_rate),
      })),
    };
    if (paymentStatus === 'partial' && parsedPaid > 0) {
      body.paid_amount = parsedPaid;
    }
    return body;
  }, [customerId, paymentMethod, paymentStatus, paidAmount, items]);

  // ── Create sale mutation ────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: createSale,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products-search-lean'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['sales-trend'] });
      const inv = data?.invoice_no || '';
      toast.success(`Invoice${inv ? ` ${inv}` : ''} created successfully!`);
      navigate('/sales', {
        state: {
          openInvoice: data?.sales_id,
          autoPrint:   autoPrint,
          invoiceNo:   inv,
        },
      });
    },
    onError: (err) => {
      const responseData = err?.response?.data;
      if (responseData?.error_code === 'INSUFFICIENT_STOCK' && responseData?.stock_errors?.length > 0) {
        setStockErrors(responseData.stock_errors);
        setPendingBody(buildBody(false));
        return;
      }
      toast.error(responseData?.message || 'Failed to create invoice');
    },
  });

  // ── Stock override handlers ──────────────────────────────────────────────
  const handleStockOverrideConfirm = useCallback(() => {
    setStockErrors([]);
    setPendingBody(null);
    mutation.mutate(buildBody(true));
  }, [mutation, buildBody]);

  const handleStockOverrideCancel = useCallback(() => {
    setStockErrors([]);
    setPendingBody(null);
  }, []);

  // ── Line item handlers ────────────────────────────────────────────────────
  const handleItemSearchChange = useCallback((itemId, text) => {
    setSearchMap(prev  => ({ ...prev, [itemId]: text }));
    setOpenDropMap(prev => ({ ...prev, [itemId]: true }));
    setActiveItemSearch(text);
  }, []);

  const handleProductSelect = useCallback((itemId, product) => {
    setItems(prev => {
      const isLast = prev[prev.length - 1]._id === itemId;
      const updated = prev.map(item => {
        if (item._id !== itemId) return item;
        return {
          ...item,
          product_id:     product.prod_id,
          prod_name:      product.prod_name,
          mrp:            Number(product.prod_mrp) || 0,
          unit_price:     Number(product.prod_sell_price) || 0,
          tax_rate:       Number(product.tax_rate) || 0,
          prod_stock_qty: Number(product.prod_stock_qty) ?? null,
        };
      });
      return isLast ? [...updated, newItem()] : updated;
    });
    setSearchMap(prev   => ({ ...prev, [itemId]: '' }));
    setOpenDropMap(prev  => ({ ...prev, [itemId]: false }));
    setActiveItemSearch('');
  }, []);

  const handleCloseDropdown = useCallback((itemId) => {
    setOpenDropMap(prev => ({ ...prev, [itemId]: false }));
  }, []);

  const handleOpenDropdown = useCallback((itemId) => {
    setOpenDropMap(() => ({ [itemId]: true }));
    setSearchMap(prev => {
      setActiveItemSearch(prev[itemId] || '');
      return prev;
    });
  }, []);

  const handleClearProduct = useCallback((itemId) => {
    setItems(prev => prev.map(i =>
      i._id === itemId
        ? { ...i, product_id: '', prod_name: '', mrp: 0, unit_price: 0, tax_rate: 0, prod_stock_qty: null }
        : i
    ));
  }, []);

  const addItem = useCallback(() => setItems(prev => [...prev, newItem()]), []);

  const updateItem = useCallback((id, field, value) =>
    setItems(prev => prev.map(item =>
      item._id === id ? { ...item, [field]: value } : item
    )), []);

  const removeItem = useCallback((id) =>
    setItems(prev => prev.filter(i => i._id !== id)), []);

  // ── Running totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal     = 0;
    let taxTotal     = 0;
    let autoDiscount = 0;
    items.forEach(item => {
      const s = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
      const rawTax = s * ((Number(item.tax_rate) || 0) / 100);
      const t = Math.round(rawTax * 100) / 100;
      subtotal += Math.round(s * 100) / 100;
      taxTotal += t;

      const itemMrp = Number(item.mrp) || 0;
      if (itemMrp > 0) {
        const diff = itemMrp - (Number(item.unit_price) || 0);
        if (diff > 0) autoDiscount += diff * (Number(item.quantity) || 0);
      }
    });
    const grandTotal = subtotal + taxTotal;
    return { subtotal, taxTotal, autoDiscount, grandTotal };
  }, [items]);

  // ── Partial payment validation ────────────────────────────────────────────
  const parsedPaidAmount = Number(paidAmount) || 0;
  const paidAmountValid =
    paymentStatus !== 'partial' ||
    (parsedPaidAmount > 0 && parsedPaidAmount < totals.grandTotal);

  // ── Form validation ───────────────────────────────────────────────────────
  const isValid = useMemo(() =>
    items.length > 0 &&
    items.every(i => i.product_id && Number(i.quantity) >= 1) &&
    paidAmountValid,
    [items, paidAmountValid]
  );

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!isValid) {
      if (!paidAmountValid) {
        toast.error('Enter a valid paid amount (must be > 0 and less than the total).');
      } else {
        toast.error('Select a product and enter a valid quantity for every line item.');
      }
      return;
    }
    mutation.mutate(buildBody(false));
  }, [isValid, paidAmountValid, mutation, buildBody]);

  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => { handleSubmitRef.current = handleSubmit; });

  // ── Auto-focus barcode once customers load ────────────────────────────────
  useEffect(() => {
    if (!loadingCust) {
      barcodeRef.current?.focus();
    }
  }, [loadingCust]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      const modalOpen = showAddCustModal || stockErrors.length > 0;

      if (e.key === 'F2') {
        e.preventDefault();
        barcodeRef.current?.focus();
        return;
      }

      if (inInput || modalOpen) return;

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmitRef.current();
        return;
      }

      if (e.key === 'U' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        handleOpenAddCust('');
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddCustModal, stockErrors.length]);

  // ── Auto-print toggle ─────────────────────────────────────────────────────
  const handleAutoPrintChange = useCallback((checked) => {
    setAutoPrint(checked);
    setAutoPrintInvoice(checked);
  }, []);

  // ── Country change for add-customer modal ─────────────────────────────────
  const handleCountryChange = useCallback((val) => {
    setNewCustCountry(val);
    setNewCustState('');
  }, []);

  return {
    customers: allCustomers,
    loadingCust,

    customerId, handleCustomerChange,

    barcodeInput, setBarcodeInput, barcodeError, setBarcodeError,
    barcodeLoading, barcodeRef, handleBarcodeScan,

    items, searchMap, openDropMap, productSearchResults,
    handleItemSearchChange, handleProductSelect,
    handleCloseDropdown, handleOpenDropdown, handleClearProduct,
    addItem, updateItem, removeItem,

    paymentMethod, setPaymentMethod, paymentStatus, setPaymentStatus,
    paidAmount, setPaidAmount,

    autoPrint, handleAutoPrintChange,

    showAddCustModal, newCustName, newCustPhone, newCustEmail,
    newCustCountry, newCustState, addCustLoading,
    setNewCustName, setNewCustPhone, setNewCustEmail,
    handleCountryChange, setNewCustState,
    handleCloseAddCustModal, handleAddNewCustomerSubmit,
    handleOpenAddCust,

    stockErrors, handleStockOverrideConfirm, handleStockOverrideCancel,

    totals, isValid, isPageLoading: loadingCust,

    handleSubmit, isPending: mutation.isPending,
    parsedPaidAmount,
  };
}
