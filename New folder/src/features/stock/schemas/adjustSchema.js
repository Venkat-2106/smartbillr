import { z } from 'zod'

export const adjustSchema = z.object({
  adjustment_type: z.enum(['add', 'remove', 'set'], {
    required_error: 'Select an adjustment type',
  }),
  qty: z.coerce
    .number({ invalid_type_error: 'Enter a valid number' })
    .int('Must be a whole number')
    .positive('Must be greater than zero'),
  move_notes: z.string().max(500, 'Max 500 characters').optional().or(z.literal('')),
})
