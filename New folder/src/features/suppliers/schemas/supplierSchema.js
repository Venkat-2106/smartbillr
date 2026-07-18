import { z } from 'zod'

export const supplierSchema = z.object({
  supp_name:         z.string().min(1, 'Supplier name is required'),
  supp_phone:        z.string().optional().or(z.literal('')),
  supp_email:        z.union([
                       z.string().email('Invalid email address'),
                       z.literal(''),
                     ]).optional(),
  supp_address:      z.string().optional().or(z.literal('')),
  supp_country_code: z.string().optional().or(z.literal('')),
  supp_state:        z.string().optional().or(z.literal('')),
  supp_tax_number:   z.string().optional().or(z.literal('')),
})
