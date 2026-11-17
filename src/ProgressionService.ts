import { supabase } from './lib/supabase'
import type { ProgressionEntry, ProgressionInput, ProgressionOptions, YouthChallenge } from './lib/progression'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProgressionOptions(value: unknown): value is ProgressionOptions {
  return isRecord(value) && typeof value.can_write === 'boolean' &&
    Array.isArray(value.labels) && value.labels.every((item) => isRecord(item) &&
      typeof item.code === 'string' && typeof item.active === 'boolean' && Number.isInteger(item.sort_order)) &&
    Array.isArray(value.markers) && value.markers.every((item) => isRecord(item) &&
      typeof item.code === 'string' && typeof item.display_name === 'string' && typeof item.active === 'boolean') &&
    Array.isArray(value.badges) && value.badges.every((item) => isRecord(item) &&
      typeof item.code === 'string' && typeof item.display_name === 'string' && typeof item.active === 'boolean' &&
      (item.required_hours === null || typeof item.required_hours === 'number' && Number.isFinite(item.required_hours))) &&
    Array.isArray(value.responsibles) && value.responsibles.every((item) => isRecord(item) &&
      typeof item.id === 'string' && (item.display_name === null || typeof item.display_name === 'string'))
}

export async function loadProgression(youthId: string) {
  const [entries, challenges, options] = await Promise.all([
    supabase.from('progression_entries')
      .select('id, category, label_code, challenge_code, marker_code, degrees, badge_code, hours, responsible, description, occurred_at, active, revision')
      .eq('youth_id', youthId).eq('scope_type', 'youth')
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .returns<ProgressionEntry[]>(),
    supabase.from('youth_challenges')
      .select('id, label_code, challenge_slot, challenge_text, completed_at, revision')
      .eq('youth_id', youthId).order('challenge_slot')
      .returns<YouthChallenge[]>(),
    supabase.rpc('progression_editor_options', { p_youth_id: youthId }).returns<ProgressionOptions>(),
  ])
  const error = entries.error || challenges.error || options.error
  if (error) throw new Error(`Impossible de charger la progression. ${error.message}`)
  if (!isProgressionOptions(options.data) || !entries.data || !challenges.data) {
    throw new Error('Réponse de progression incomplète.')
  }
  return { entries: entries.data, challenges: challenges.data, options: options.data }
}

function requireSavedId(data: unknown, error: { message: string } | null, expectedId: string) {
  if (error) throw new Error(error.message)
  if (data !== expectedId) throw new Error('Confirmation d’enregistrement invalide. Actualisez avant de réessayer.')
}

export async function saveProgression(youthId: string, input: ProgressionInput) {
  const { data, error } = await supabase.rpc('save_youth_progression', {
    p_youth_id: youthId, p_id: input.id, p_revision: input.revision,
    p_category: input.category, p_code: input.code,
    p_degrees: input.degrees, p_hours: input.hours, p_date: input.date,
    p_responsible_id: input.responsibleId, p_description: input.description,
  }).returns<string>()
  requireSavedId(data, error, input.id)
}

export async function saveChallenge(
  youthId: string, label: string, slot: number, text: string, id: string, revision: number | null,
) {
  const { data, error } = await supabase.rpc('save_youth_challenge', {
    p_youth_id: youthId, p_id: id, p_revision: revision,
    p_label_code: label, p_slot: slot, p_text: text,
  }).returns<string>()
  requireSavedId(data, error, id)
}

export async function recognizeChallenge(
  youthId: string, challenge: YouthChallenge, entryId: string, date: string, responsibleId: string,
) {
  const { data, error } = await supabase.rpc('recognize_youth_challenge', {
    p_youth_id: youthId, p_challenge_id: challenge.id, p_revision: challenge.revision,
    p_entry_id: entryId, p_date: date, p_responsible_id: responsibleId,
  }).returns<string>()
  requireSavedId(data, error, entryId)
}

export async function deactivateProgression(youthId: string, entry: ProgressionEntry) {
  const { data, error } = await supabase.rpc('deactivate_youth_progression', {
    p_youth_id: youthId, p_id: entry.id, p_revision: entry.revision,
  }).returns<string>()
  requireSavedId(data, error, entry.id)
}
