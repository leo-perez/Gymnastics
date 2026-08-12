import {
  CLUB_ALIASES,
  CLUB_META,
  EXTRA_COLORS,
  INDIVIDUAL_SHEETS,
  TEAM_SHEETS,
} from './importConfig'
import type {
  Apparatus,
  Competition,
  CompetitionDataset,
  CompetitionTeam,
  Gymnast,
  Score,
  Team,
} from '../data/types'

type Row = (string | number | null | undefined)[]

const APPARATUS: Apparatus[] = ['vault', 'bars', 'beam', 'floor']

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const excelDate = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  if (typeof value === 'number' && value > 30000) {
    const epoch = new Date(1899, 11, 30)
    epoch.setDate(epoch.getDate() + value)
    return epoch.toISOString().slice(0, 10)
  }
  return null
}

const formatLocation = (address: string | null | undefined): string => {
  if (!address) return ''
  const parts = String(address)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const city = parts[parts.length - 1].replace(/\s+\d+\s*$/, '').trim()
    const neighborhood = parts[parts.length - 2]
    return city ? `${neighborhood}, ${city}` : neighborhood
  }
  return parts[0]?.replace(/\s+\d+\s*$/, '').trim() ?? ''
}

const findHeaderRow = (rows: Row[]): number => {
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    const row = rows[index]
    if (!row?.length) continue
    const cells = row.slice(0, 6).map((cell) => String(cell ?? '').trim().toLowerCase())
    if (cells.includes('rank') && cells.includes('name')) return index
    if (cells.includes('name') && cells.includes('club')) return index
  }
  return 3
}

const sheetDate = (rows: Row[]): string | null => {
  for (const row of rows.slice(0, 5)) {
    if (!row?.length) continue
    for (const cell of row) {
      const date = excelDate(cell)
      if (date) return date
    }
  }
  return null
}

const sheetLocation = (rows: Row[], headerIndex: number): string => {
  for (const row of rows.slice(0, headerIndex)) {
    if (!row?.length || row[0] == null) continue
    if (excelDate(row[0])) continue
    const text = String(row[0]).trim()
    if (text.includes(',')) return formatLocation(text)
  }
  return ''
}

const parseScore = (value: unknown): number | null => {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text || ['DNS', 'DNF', '-'].includes(text.toUpperCase())) return null
    const parsed = Number.parseFloat(text.replace(/\*$/, '').trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const normalizeClub = (raw: unknown): string => {
  if (!raw) return 'Unknown Club'
  const name = String(raw).replace(/\s+/g, ' ').trim()
  return CLUB_ALIASES[name.toLowerCase()] ?? name
}

const shortNameFor = (name: string): string => {
  if (name in CLUB_META) return CLUB_META[name][0]
  const parts = name.match(/[A-Za-z0-9]+/g) ?? []
  if (!parts.length) return name.slice(0, 3).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase()
  return parts
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const colorFor = (name: string, index: number): string =>
  CLUB_META[name]?.[1] ?? EXTRA_COLORS[index % EXTRA_COLORS.length]

const cityFor = (name: string): string => CLUB_META[name]?.[2] ?? ''

export type SheetData = Record<string, Row[]>

export const parseSheetData = (sheets: SheetData): CompetitionDataset => {
  const clubs = new Map<string, Team>()
  const gymnastsByName = new Map<string, Gymnast>()
  const scores: Score[] = []
  const competitions: Competition[] = []
  const competitionTeams: CompetitionTeam[] = []
  let nextId = 1

  const ensureClub = (rawName: unknown): string => {
    const name = normalizeClub(rawName)
    const clubId = slugify(name)
    if (!clubs.has(clubId)) {
      clubs.set(clubId, {
        id: clubId,
        name,
        shortName: shortNameFor(name),
        color: colorFor(name, clubs.size),
        city: cityFor(name),
      })
    }
    return clubId
  }

  const ensureGymnast = (name: string, clubId: string): string => {
    const key = name.trim().toLowerCase()
    const existing = gymnastsByName.get(key)
    if (existing) {
      if (existing.teamId === 'unknown-club' && clubId !== 'unknown-club') {
        existing.teamId = clubId
      }
      return existing.id
    }
    const gymnastId = `g${nextId++}`
    gymnastsByName.set(key, {
      id: gymnastId,
      name: name.replace(/\s+/g, ' ').trim(),
      teamId: clubId,
    })
    return gymnastId
  }

  const resolveSheet = (prefix: string, available: string[]): string => {
    if (available.includes(prefix)) return prefix
    const match = available.find((name) => name.startsWith(prefix.trim()))
    if (!match) {
      throw new Error(`Missing sheet starting with "${prefix}"`)
    }
    return match
  }

  const availableSheets = Object.keys(sheets)

  for (const meta of INDIVIDUAL_SHEETS) {
    const sheetName = resolveSheet(meta.sheet, availableSheets)
    const rows = sheets[sheetName]
    const headerIndex = findHeaderRow(rows)
    const date = sheetDate(rows)
    const location = sheetLocation(rows, headerIndex)

    competitions.push({
      id: meta.id,
      name: meta.name,
      date: date ?? '2026-01-01',
      location,
      category: 'Women',
      level: 'Open',
    })

    for (const row of rows.slice(headerIndex + 1)) {
      if (!row?.length || row[1] == null) continue
      const name = String(row[1]).trim()
      if (!name) continue

      const clubId = ensureClub(row[2])
      const gymnastId = ensureGymnast(name, clubId)
      const apparatusScores: Record<Apparatus, number | null> = {
        vault: parseScore(row[4]),
        bars: parseScore(row[6]),
        beam: parseScore(row[8]),
        floor: parseScore(row[10]),
      }

      if (APPARATUS.every((app) => apparatusScores[app] == null)) continue

      for (const apparatus of APPARATUS) {
        const score = apparatusScores[apparatus]
        if (score == null) continue
        scores.push({ competitionId: meta.id, gymnastId, apparatus, score })
      }
    }
  }

  for (const meta of TEAM_SHEETS) {
    const sheetName = resolveSheet(meta.sheet, availableSheets)
    const rows = sheets[sheetName]
    let currentTeam: CompetitionTeam | null = null

    for (const row of rows.slice(1)) {
      if (!row?.length || row[0] == null) continue
      const kind = String(row[0]).trim()

      if (kind === 'Team') {
        const teamName = String(row[2]).trim()
        const clubRaw = row[4]
        let clubId: string | undefined
        if (clubRaw && !String(clubRaw).includes('/')) {
          clubId = ensureClub(clubRaw)
        }
        const color = clubId ? clubs.get(clubId)!.color : colorFor(teamName, competitionTeams.length)
        const teamId = `${meta.competitionId}-${slugify(teamName)}`
        currentTeam = {
          id: teamId,
          competitionId: meta.competitionId,
          name: teamName,
          shortName: shortNameFor(teamName),
          clubId,
          color,
          rank: typeof row[1] === 'number' ? row[1] : Number(row[1]) || 0,
          apparatus: {
            vault: parseScore(row[5]) ?? 0,
            bars: parseScore(row[7]) ?? 0,
            beam: parseScore(row[9]) ?? 0,
            floor: parseScore(row[11]) ?? 0,
          },
          total: parseScore(row[13]) ?? 0,
          members: [],
        }
        competitionTeams.push(currentTeam)
      } else if (kind === 'Gymnast' && currentTeam) {
        const name = String(row[3]).trim()
        const clubId = ensureClub(row[4])
        const gymnastId = ensureGymnast(name, clubId)
        const memberScores = {
          vault: parseScore(row[5]),
          bars: parseScore(row[7]),
          beam: parseScore(row[9]),
          floor: parseScore(row[11]),
        }
        const total = parseScore(row[13])
        currentTeam.members.push({
          gymnastId,
          scores: Object.fromEntries(
            APPARATUS.filter((app) => memberScores[app] != null).map((app) => [app, memberScores[app]!]),
          ),
          total,
        })
      }
    }
  }

  const gymnastList = [...gymnastsByName.values()].sort(
    (a, b) => Number.parseInt(a.id.slice(1), 10) - Number.parseInt(b.id.slice(1), 10),
  )
  const teamList = [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name))

  return {
    competitions,
    teams: teamList,
    gymnasts: gymnastList,
    scores,
    competitionTeams,
  }
}
