import { z } from 'zod'

export const createSchema = z.object({
  prod_name:            z.string().trim().min(1, 'Product name is required').max(100),
  prod_sell_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_cost_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_mrp:             z.coerce.number().min(0, 'Cannot be negative').default(0),
  prod_stock_qty:       z.coerce.number().int().min(0, 'Cannot be negative').default(0),
  prod_low_stock_alert: z.coerce.number().int().min(0, 'Cannot be negative').default(10),
  tax_rate:             z.coerce.number().min(0, 'Cannot be negative').max(100, 'Max 100%').default(0),
  tax_code:             z.string().max(50).optional().or(z.literal('')),
  barcode:              z.string().max(100).optional().or(z.literal('')),
  unit:                 z.string().default('pcs'),
  category_id:          z.string().min(1, 'Category is required'),
})

export const editSchema = z.object({
  prod_name:            z.string().trim().min(1, 'Product name is required').max(100),
  prod_sell_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_cost_price:      z.coerce.number({ invalid_type_error: 'Enter a valid price' }).min(0, 'Cannot be negative'),
  prod_mrp:             z.coerce.number().min(0, 'Cannot be negative').default(0),
  prod_low_stock_alert: z.coerce.number().int().min(0, 'Cannot be negative').default(10),
  tax_rate:             z.coerce.number().min(0, 'Cannot be negative').max(100, 'Max 100%').default(0),
  tax_code:             z.string().max(50).optional().or(z.literal('')),
  barcode:              z.string().max(100).optional().or(z.literal('')),
  unit:                 z.string().default('pcs'),
  category_id:          z.string().min(1, 'Category is required'),
})
