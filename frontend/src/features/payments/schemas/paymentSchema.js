import { z } from 'zod'

export const paymentSchema = z.object({
  payment_amount: z
    .string()
    .min(1, 'Amount is required')
    .refine(v => !isNaN(Number(v)) && Number(v) > 0, 'Must be a positive number'),
  payment_method: z
    .string()
    .min(1, 'Payment method is required'),
})
