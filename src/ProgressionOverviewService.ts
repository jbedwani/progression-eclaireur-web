
import { supabase } from './lib/supabase'
import type {
  ProgressionEntry,
  YouthChallenge,
} from './lib/progression'

export type ProgressionOverviewEntry = ProgressionEntry & {
  youth_id: string
}

export type ProgressionOverviewChallenge = YouthChallenge & {
  youth_id: string
}

export type ProgressionOverviewCatalogs = {
  labels: { code: string; sort_order: number; active: boolean }[]
  markers: { code: string; display_name: string; active: boolean }[]
  badges: {
    code: string
    display_name: string
    required_hours: number | null
    active: boolean
  }[]
}

export async function loadProgressionOverview() {
  const [entries, challenges, labels, markers, badges] = await Promise.all([
    supabase
      .from('progression_entries')
      .select(`
        id, youth_id, category, label_code, challenge_code,
        marker_code, degrees, badge_code, hours, responsible,
        description, occurred_at, active, revision
      `)
      .eq('scope_type', 'youth')
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .returns<ProgressionOverviewEntry[]>(),

    supabase
      .from('youth_challenges')
      .select(`
        id, youth_id, label_code, challenge_slot,
        challenge_text, completed_at, revision
      `)
      .order('label_code')
      .order('challenge_slot')
      .returns<ProgressionOverviewChallenge[]>(),

    supabase
      .from('catalog_labels')
      .select('code, sort_order, active')
      .order('sort_order')
      .returns<ProgressionOverviewCatalogs['labels']>(),

    supabase
      .from('catalog_markers')
      .select('code, display_name, active')
      .order('display_name')
      .returns<ProgressionOverviewCatalogs['markers']>(),

    supabase
      .from('catalog_badges')
      .select('code, display_name, required_hours, active')
      .order('display_name')
      .returns<ProgressionOverviewCatalogs['badges']>(),
  ])

  const error =
    entries.error ||
    challenges.error ||
    labels.error ||
    markers.error ||
    badges.error

  if (error) {
    throw new Error(
      `Impossible de charger la progression collective. ${error.message}`,
    )
  }

  if (
    !entries.data ||
    !challenges.data ||
    !labels.data ||
    !markers.data ||
    !badges.data
  ) {
    throw new Error('Données de progression collective incomplètes.')
  }

  return {
    entries: entries.data,
    challenges: challenges.data,
    catalogs: {
      labels: labels.data,
      markers: markers.data,
      badges: badges.data,
    } satisfies ProgressionOverviewCatalogs,
  }
}
