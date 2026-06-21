import { z } from 'zod'

export const categorySchema = z.object({
  category_name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
})
