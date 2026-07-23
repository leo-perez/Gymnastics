export const APPARATUS = ['vault', 'bars', 'beam', 'floor'] as const

export type Apparatus = (typeof APPARATUS)[number]

export const APPARATUS_LABELS: Record<Apparatus, string> = {
  vault: 'Vault',
  bars: 'U-Bars',
  beam: 'Beam',
  floor: 'Floor',
}

export interface Competition {
  id: string
  name: string
  date: string
  location: string
  category: string
  level: string
}

export interface Team {
  id: string
  name: string
  shortName: string
  color: string
  city: string
}

export interface Gymnast {
  id: string
  name: string
  teamId: string
  age?: number
}

export interface Score {
  competitionId: string
  gymnastId: string
  apparatus: Apparatus
  score: number
}

export interface CompetitionTeamMember {
  gymnastId: string
  scores: Partial<Record<Apparatus, number>>
  total: number | null
}

export interface CompetitionTeam {
  id: string
  competitionId: string
  name: string
  shortName: string
  clubId?: string
  color: string
  rank: number
  total: number
  apparatus: Record<Apparatus, number>
  members: CompetitionTeamMember[]
}

export interface CompetitionDataset {
  competitions: Competition[]
  teams: Team[]
  gymnasts: Gymnast[]
  scores: Score[]
  competitionTeams: CompetitionTeam[]
}
