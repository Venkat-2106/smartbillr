import { z } from 'zod'

export const addStaffSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().min(1, 'Role is required'),
})

export const editStaffSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  role: z.string().min(1, 'Role is required'),
})
