import { z } from 'zod'

export const businessSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(200),
  business_email: z.string().email('Invalid email').optional().or(z.literal('')),
  business_phone: z.string().max(20).optional().or(z.literal('')),
  business_address: z.string().max(500).optional().or(z.literal('')),
  business_state: z.string().max(100).optional().or(z.literal('')),
  business_country_code: z.string().max(5).optional().or(z.literal('')),
  gstin: z.string().max(50).optional().or(z.literal('')),
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
