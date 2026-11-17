/** A former youth may keep an existing current-year assignment for history,
 * but cannot receive a new assignment. Removing an existing assignment stays allowed.
 */
export function canSaveYouthPatrol(active: boolean, existingPatrolId: string | null, selectedPatrolId: string): boolean {
  if (active) return true
  return selectedPatrolId === '' || selectedPatrolId === existingPatrolId
}

/** Keep legacy post values visible; NULL/empty represents an ordinary member. */
export function formatPatrolPost(postName: string | null): string {
  if (postName === 'C.P.' || postName === 'S.P.') return postName
  return postName?.trim() || 'Membre'
}
