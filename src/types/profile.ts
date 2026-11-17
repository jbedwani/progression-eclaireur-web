
export type AppRole =
  | 'guardian'
  | 'youth'
  | 'animator'
  | 'admin'

export interface Profile {
  id: string
  display_name: string | null
  role: AppRole
  active: boolean
  created_at: string
}

