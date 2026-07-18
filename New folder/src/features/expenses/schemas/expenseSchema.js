import { z } from 'zod'

export const expenseSchema = z.object({
  expense_category: z.string().min(1, 'Category is required'),
  expense_amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Amount must be positive'),
  expense_date: z.string().optional().or(z.literal('')),
  expense_notes: z.string().max(500, 'Max 500 characters').optional().or(z.literal('')),
})
