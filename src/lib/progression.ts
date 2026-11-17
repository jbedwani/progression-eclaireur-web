export type ProgressionCategory = 'label' | 'marker' | 'badge'

export type ProgressionEntry = {
  id: string
  category: string
  label_code: string | null
  challenge_code: string | null
  marker_code: string | null
  degrees: number | null
  badge_code: string | null
  hours: number | null
  responsible: string | null
  description: string | null
  occurred_at: string | null
  active: boolean
  revision: number
}

export type YouthChallenge = {
  id: string
  label_code: string
  challenge_slot: number
  challenge_text: string | null
  completed_at: string | null
  revision: number
}

export type ProgressionOptions = {
  can_write: boolean
  labels: { code: string; sort_order: number; active: boolean }[]
  markers: { code: string; display_name: string; active: boolean }[]
  badges: { code: string; display_name: string; required_hours: number | null; active: boolean }[]
  responsibles: { id: string; display_name: string | null }[]
}

export type ProgressionInput = {
  id: string
  revision: number | null
  category: ProgressionCategory
  code: string
  degrees: number | null
  hours: number | null
  date: string
  responsibleId: string | null
  description: string | null
}

export function positiveInteger(value: string): number {
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Saisissez un entier strictement positif.')
  }
  return parsed
}

export function montrealToday(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function progressionDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Date de progression invalide.')
  // Les imports historiques utilisaient minuit UTC pour représenter une date seule.
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return date.toISOString().slice(0, 10)
  }
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

export function activeTotals(entries: ProgressionEntry[]) {
  return entries.filter((entry) => entry.active).reduce((total, entry) => ({
    degrees: total.degrees + (entry.degrees ?? 0),
    hours: total.hours + (entry.hours ?? 0),
  }), { degrees: 0, hours: 0 })
}

export function badgeProgress(entries: ProgressionEntry[], code: string, requiredHours: number) {
  const { hours } = activeTotals(entries.filter((entry) => entry.category === 'badge' && entry.badge_code === code))
  return { hours, obtained: hours >= requiredHours }
}

export function labelPrerequisites(
  entries: ProgressionEntry[], labels: ProgressionOptions['labels'], code: string,
) {
  const label = labels.find((item) => item.code === code)
  if (!label) throw new Error('Label introuvable.')
  return labels.filter((item) => item.sort_order < label.sort_order &&
    ![1, 2, 3].every((slot) => entries.some((entry) =>
      entry.active && entry.category === 'label' && entry.label_code === item.code &&
      entry.challenge_code === `Défi ${slot}`)))
    .sort((a, b) => a.sort_order - b.sort_order)
}
