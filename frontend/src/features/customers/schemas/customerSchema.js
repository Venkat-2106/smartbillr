import { z } from 'zod'

export const customerSchema = z.object({
  cust_name:         z.string().min(1, 'Name is required').max(150).trim(),
  cust_phone:        z.string().max(20).trim().optional().or(z.literal('')),
  cust_email:        z.string().email('Invalid email').optional().or(z.literal('')),
  cust_address:      z.string().max(300).trim().optional().or(z.literal('')),
  cust_state:        z.string().max(100).trim().optional().or(z.literal('')),
  cust_country_code: z.string().max(5).trim().optional().or(z.literal('')),
  cust_tax_number:   z.string().max(50).trim().optional().or(z.literal('')),
})
