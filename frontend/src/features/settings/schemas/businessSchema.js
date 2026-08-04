import { z } from 'zod'

export const businessSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(200),
  business_email: z.string().email('Invalid email').optional().or(z.literal('')),
  business_phone: z.string().max(20).optional().or(z.literal('')),
  business_address: z.string().max(500).optional().or(z.literal('')),
  business_state: z.string().max(100).optional().or(z.literal('')),
  business_country_code: z.string().max(5).optional().or(z.literal('')),
  gstin: z
    .string()
    .max(50)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v || '').toUpperCase().replace(/\s+/g, ''))
    .refine(
      (v) =>
        !v ||
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
      {
        message: 'Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5',
      }
    ),
  is_gst_registered: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.is_gst_registered) {
      if (data.business_country_code && data.business_country_code !== 'IN') {
        return false
      }
      if (!data.gstin || data.gstin.trim() === '') {
        return false
      }
    }
    return true
  },
  {
    message: 'GST registration is only available for Indian businesses with a valid GSTIN',
    path: ['is_gst_registered'],
  }
)
