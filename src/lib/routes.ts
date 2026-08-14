export type View = 'home' | 'overview' | 'teams' | 'gymnasts'
export type ListOverlay = 'teams' | 'gymnasts' | null

export type AppLocation = {
  view: View
  competitionId: string
  teamId: string
  gymnastId: string
  listOverlay: ListOverlay
}

const isListOverlay = (value: string | null): value is Exclude<ListOverlay, null> =>
  value === 'teams' || value === 'gymnasts'

export const locationToPath = (loc: AppLocation): string => {
  const query = loc.listOverlay ? `?list=${loc.listOverlay}` : ''
  if (loc.view === 'home') return `/${query}`

  const base = `/c/${encodeURIComponent(loc.competitionId)}`
  if (loc.view === 'overview') return `${base}${query}`
  if (loc.view === 'teams') {
    const team = loc.teamId !== 'all' ? `/${encodeURIComponent(loc.teamId)}` : ''
    return `${base}/teams${team}${query}`
  }

  const gymnast = loc.gymnastId !== 'all' ? `/${encodeURIComponent(loc.gymnastId)}` : ''
  return `${base}/gymnasts${gymnast}${query}`
}

export const pathToLocation = (
  pathname: string,
  search: string,
  fallbackCompetitionId: string,
  knownCompetitionIds: Set<string>,
): AppLocation => {
  const listParam = new URLSearchParams(search).get('list')
  const listOverlay: ListOverlay = isListOverlay(listParam) ? listParam : null
  const home: AppLocation = {
    view: 'home',
    competitionId: fallbackCompetitionId,
    teamId: 'all',
    gymnastId: 'all',
    listOverlay,
  }

  const parts = pathname.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  })

  if (parts[0] !== 'c' || !parts[1]) return home

  const competitionId = knownCompetitionIds.has(parts[1]) ? parts[1] : fallbackCompetitionId
  const section = parts[2]
  const entityId = parts[3]

  if (section === 'teams') {
    return { view: 'teams', competitionId, teamId: entityId ?? 'all', gymnastId: 'all', listOverlay }
  }
  if (section === 'gymnasts') {
    return { view: 'gymnasts', competitionId, teamId: 'all', gymnastId: entityId ?? 'all', listOverlay }
  }

  return { view: 'overview', competitionId, teamId: 'all', gymnastId: 'all', listOverlay }
}

export const isAppLocation = (value: unknown): value is AppLocation => {
  if (!value || typeof value !== 'object') return false
  const loc = value as AppLocation
  return (
    (loc.view === 'home' || loc.view === 'overview' || loc.view === 'teams' || loc.view === 'gymnasts')
    && typeof loc.competitionId === 'string'
    && typeof loc.teamId === 'string'
    && typeof loc.gymnastId === 'string'
    && (loc.listOverlay === null || loc.listOverlay === 'teams' || loc.listOverlay === 'gymnasts')
  )
}

export const sameLocation = (a: AppLocation, b: AppLocation): boolean =>
  locationToPath(a) === locationToPath(b)
