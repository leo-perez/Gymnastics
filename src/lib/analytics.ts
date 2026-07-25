import {
  APPARATUS,
  APPARATUS_LABELS,
  type Apparatus,
  type Competition,
  type CompetitionDataset,
  type CompetitionTeam,
  type Gymnast,
} from '../data/types'

const round = (value: number, places = 3) =>
  Number(value.toFixed(places))

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC day-shift). */
const parseLocalDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const formatAxisDate = (isoDate: string) =>
  parseLocalDate(isoDate).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

const standardDeviation = (values: number[]) => {
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

export interface GymnastResult {
  id: string
  name: string
  teamId: string
  teamName: string
  scores: Record<Apparatus, number>
  total: number
  average: number
  consistency: number
  rank: number
  contribution: number
}

export interface TeamResult {
  id: string
  name: string
  shortName: string
  color: string
  apparatus: Record<Apparatus, number>
  total: number
  rank: number
  strongest: Apparatus
  weakest: Apparatus
  reliance: number
  depth: number
  memberIds: string[]
  official: boolean
}

export interface Insight {
  id: string
  eyebrow: string
  title: string
  body: string
  evidence: string
  tone: 'violet' | 'coral' | 'teal' | 'gold'
}

export interface CompetitionSnapshot {
  gymnasts: GymnastResult[]
  teams: TeamResult[]
  insights: Insight[]
  competitionAverage: number
  topScores: Record<Apparatus, GymnastResult>
  closestGap: number
  teamsOfficial: boolean
}

const scoreMapFor = (dataset: CompetitionDataset, competitionId: string) => {
  const map = new Map<string, Partial<Record<Apparatus, number>>>()
  dataset.scores
    .filter((score) => score.competitionId === competitionId)
    .forEach(({ gymnastId, apparatus, score }) => {
      const current = map.get(gymnastId) ?? {}
      current[apparatus] = score
      map.set(gymnastId, current)
    })
  return map
}

const hasFullAllAround = (
  scores: Partial<Record<Apparatus, number>>,
): scores is Record<Apparatus, number> =>
  APPARATUS.every((item) => typeof scores[item] === 'number')

const buildTeamResult = (
  team: {
    id: string
    name: string
    shortName: string
    color: string
    apparatus: Record<Apparatus, number>
    total: number
    memberIds: string[]
    official: boolean
  },
  memberTotals: number[],
): Omit<TeamResult, 'rank' | 'reliance'> => {
  const orderedApparatus = [...APPARATUS].sort(
    (a, b) => team.apparatus[b] - team.apparatus[a],
  )
  const sortedTotals = [...memberTotals].sort((a, b) => b - a)
  return {
    ...team,
    strongest: orderedApparatus[0],
    weakest: orderedApparatus[orderedApparatus.length - 1],
    depth: round(
      (sortedTotals[0] ?? 0) - (sortedTotals[Math.min(2, sortedTotals.length - 1)] ?? 0),
    ),
  }
}

const buildOfficialTeams = (
  competitionTeams: CompetitionTeam[],
): { teams: TeamResult[]; countedByGymnast: Map<string, number> } => {
  const countedByGymnast = new Map<string, number>()

  const unranked = competitionTeams
    .map((team) => {
      const memberTotals: number[] = []
      team.members.forEach((member) => {
        const values = APPARATUS.map((item) => member.scores[item]).filter(
          (value): value is number => typeof value === 'number',
        )
        if (values.length) {
          memberTotals.push(member.total ?? round(values.reduce((sum, value) => sum + value, 0)))
        }
        APPARATUS.forEach((item) => {
          const score = member.scores[item]
          if (typeof score === 'number') {
            // Count only scores that contribute to the published apparatus total:
            // approximate by counting every scored apparatus for reliance display.
            countedByGymnast.set(
              member.gymnastId,
              (countedByGymnast.get(member.gymnastId) ?? 0) + score,
            )
          }
        })
      })

      return buildTeamResult(
        {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          color: team.color,
          apparatus: team.apparatus,
          total: round(team.total),
          memberIds: team.members.map((member) => member.gymnastId),
          official: true,
        },
        memberTotals,
      )
    })
    .sort((a, b) => {
      const rankA =
        competitionTeams.find((team) => team.id === a.id)?.rank ?? Number.MAX_SAFE_INTEGER
      const rankB =
        competitionTeams.find((team) => team.id === b.id)?.rank ?? Number.MAX_SAFE_INTEGER
      if (rankA !== rankB) return rankA - rankB
      return b.total - a.total
    })

  const teams: TeamResult[] = unranked.map((team, index) => {
    const officialRank =
      competitionTeams.find((item) => item.id === team.id)?.rank ?? index + 1
    const memberContributions = team.memberIds.map(
      (gymnastId) => countedByGymnast.get(gymnastId) ?? 0,
    )
    const topContribution = memberContributions.length
      ? Math.max(...memberContributions)
      : 0
    return {
      ...team,
      rank: officialRank || index + 1,
      reliance: team.total
        ? round((topContribution / team.total) * 100, 1)
        : 0,
    }
  })

  return { teams, countedByGymnast }
}

const buildDerivedTeams = (
  dataset: CompetitionDataset,
  gymnasts: GymnastResult[],
): { teams: TeamResult[]; countedByGymnast: Map<string, number> } => {
  const countedByGymnast = new Map<string, number>()
  const competingTeamIds = new Set(gymnasts.map((gymnast) => gymnast.teamId))

  const unranked = dataset.teams
    .filter((team) => competingTeamIds.has(team.id))
    .map((team) => {
      const members = gymnasts.filter((gymnast) => gymnast.teamId === team.id)
      const apparatusTotals = Object.fromEntries(
        APPARATUS.map((item) => {
          const topThree = [...members]
            .sort((a, b) => b.scores[item] - a.scores[item])
            .slice(0, 3)
          topThree.forEach((gymnast) => {
            countedByGymnast.set(
              gymnast.id,
              (countedByGymnast.get(gymnast.id) ?? 0) + gymnast.scores[item],
            )
          })
          return [item, round(topThree.reduce((sum, gymnast) => sum + gymnast.scores[item], 0))]
        }),
      ) as Record<Apparatus, number>

      return buildTeamResult(
        {
          ...team,
          apparatus: apparatusTotals,
          total: round(APPARATUS.reduce((sum, item) => sum + apparatusTotals[item], 0)),
          memberIds: members.map((member) => member.id),
          official: false,
        },
        members.map((member) => member.total),
      )
    })
    .sort((a, b) => b.total - a.total)

  const teams: TeamResult[] = unranked.map((team, index) => {
    const memberContributions = team.memberIds.map(
      (gymnastId) => countedByGymnast.get(gymnastId) ?? 0,
    )
    const topContribution = memberContributions.length
      ? Math.max(...memberContributions)
      : 0
    return {
      ...team,
      rank: index + 1,
      reliance: team.total
        ? round((topContribution / team.total) * 100, 1)
        : 0,
    }
  })

  return { teams, countedByGymnast }
}

export const getCompetitionSnapshot = (
  dataset: CompetitionDataset,
  competitionId: string,
): CompetitionSnapshot => {
  const scoreMap = scoreMapFor(dataset, competitionId)
  const clubById = new Map(dataset.teams.map((team) => [team.id, team]))

  const unrankedGymnasts = dataset.gymnasts
    .filter((gymnast) => {
      const scores = scoreMap.get(gymnast.id)
      return scores != null && hasFullAllAround(scores)
    })
    .map((gymnast) => {
      const scores = scoreMap.get(gymnast.id) as Record<Apparatus, number>
      const values = APPARATUS.map((item) => scores[item])
      return {
        id: gymnast.id,
        name: gymnast.name,
        teamId: gymnast.teamId,
        teamName: clubById.get(gymnast.teamId)?.name ?? '',
        scores,
        total: round(values.reduce((sum, score) => sum + score, 0)),
        average: round(average(values)),
        consistency: round(standardDeviation(values)),
        rank: 0,
        contribution: 0,
      }
    })
    .sort((a, b) => b.total - a.total)

  const gymnasts: GymnastResult[] = unrankedGymnasts.map((gymnast, index) => ({
    ...gymnast,
    rank: index + 1,
  }))

  const officialTeams = (dataset.competitionTeams ?? []).filter(
    (team) => team.competitionId === competitionId,
  )
  const teamsOfficial = officialTeams.length > 0
  const { teams, countedByGymnast } = teamsOfficial
    ? buildOfficialTeams(officialTeams)
    : buildDerivedTeams(dataset, gymnasts)

  gymnasts.forEach((gymnast) => {
    const owningTeam = teamsOfficial
      ? teams.find((team) => team.memberIds.includes(gymnast.id))
      : teams.find((team) => team.id === gymnast.teamId)
    const teamTotal = owningTeam?.total ?? 1
    gymnast.contribution = round(
      ((countedByGymnast.get(gymnast.id) ?? 0) / teamTotal) * 100,
      1,
    )
  })

  const allScores = dataset.scores
    .filter((score) => score.competitionId === competitionId)
    .map((score) => score.score)
  const competitionAverage = round(average(allScores))

  const topScores = Object.fromEntries(
    APPARATUS.map((item) => [
      item,
      [...gymnasts].sort((a, b) => b.scores[item] - a.scores[item])[0],
    ]),
  ) as Record<Apparatus, GymnastResult>

  const gaps = gymnasts.slice(0, -1).map((gymnast, index) => ({
    first: gymnast,
    second: gymnasts[index + 1],
    gap: round(gymnast.total - gymnasts[index + 1].total),
  }))
  const closest = [...gaps].sort((a, b) => a.gap - b.gap)[0]
  const mostConsistent = [...gymnasts].sort((a, b) => a.consistency - b.consistency)[0]
  const widestTeamMargin = round((teams[0]?.total ?? 0) - (teams[1]?.total ?? 0))
  const strongestScore = APPARATUS.map((item) => ({
    apparatus: item,
    gymnast: topScores[item],
    score: topScores[item]?.scores[item] ?? 0,
  })).sort((a, b) => b.score - a.score)[0]

  const insights: Insight[] = []

  if (teams[0]) {
    insights.push({
      id: 'team-lead',
      eyebrow: 'Team to beat',
      title: `${teams[0].name} led by ${widestTeamMargin.toFixed(3)}`,
      body: `${APPARATUS_LABELS[teams[0].strongest]} was their biggest advantage, while ${APPARATUS_LABELS[teams[0].weakest]} left the most room to improve.`,
      evidence: teamsOfficial
        ? `Official team total ${teams[0].total.toFixed(3)}`
        : `Team total ${teams[0].total.toFixed(3)} · Top three scores count on each apparatus`,
      tone: 'violet',
    })
  }

  if (closest) {
    insights.push({
      id: 'closest',
      eyebrow: 'Photo finish',
      title: `${closest.first.name} edged ${closest.second.name}`,
      body: `Only ${closest.gap.toFixed(3)} points separated ranks ${closest.first.rank} and ${closest.second.rank} in the all-around.`,
      evidence: `${closest.first.total.toFixed(3)} vs ${closest.second.total.toFixed(3)}`,
      tone: 'coral',
    })
  }

  if (strongestScore?.gymnast) {
    insights.push({
      id: 'standout',
      eyebrow: 'Standout score',
      title: `${strongestScore.score.toFixed(3)} on ${APPARATUS_LABELS[strongestScore.apparatus]}`,
      body: `${strongestScore.gymnast.name} produced the highest single-apparatus score of the competition.`,
      evidence: `Competition apparatus average ${average(gymnasts.map((g) => g.scores[strongestScore.apparatus])).toFixed(3)}`,
      tone: 'teal',
    })
  }

  if (mostConsistent) {
    insights.push({
      id: 'consistent',
      eyebrow: 'Steadiest performance',
      title: `${mostConsistent.name} stayed in a ${(
        Math.max(...Object.values(mostConsistent.scores)) -
        Math.min(...Object.values(mostConsistent.scores))
      ).toFixed(3)}-point range`,
      body: 'Her four apparatus scores varied less than any other gymnast in the field.',
      evidence: `Consistency uses standard deviation · ${mostConsistent.consistency.toFixed(3)} (lower is steadier)`,
      tone: 'gold',
    })
  }

  return {
    gymnasts,
    teams,
    insights,
    competitionAverage,
    topScores,
    closestGap: closest?.gap ?? 0,
    teamsOfficial,
  }
}

export interface CompetitionSummary {
  competition: Competition
  gymnastCount: number
  teamCount: number
  topGymnast: { name: string; total: number } | null
}

export const getCompetitionSummaries = (
  dataset: CompetitionDataset,
): CompetitionSummary[] =>
  [...dataset.competitions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((competition) => {
      const snapshot = getCompetitionSnapshot(dataset, competition.id)
      const leader = snapshot.gymnasts[0]
      return {
        competition,
        gymnastCount: snapshot.gymnasts.length,
        teamCount: snapshot.teams.length,
        topGymnast: leader
          ? { name: leader.name, total: leader.total }
          : null,
      }
    })

export interface SeasonGymnastStanding {
  id: string
  name: string
  teamId: string
  teamName: string
  region: string
  total: number
  competitionId: string
  competitionName: string
  meets: number
  scoredMeets: number
  rank: number
}

export interface SeasonTeamStanding {
  id: string
  resultId: string
  name: string
  color: string
  total: number
  competitionId: string
  competitionName: string
  meets: number
  rank: number
}

type GymnastMeetScore = {
  total: number
  competitionId: string
  competitionName: string
  teamId: string
  teamName: string
}

const TOP_MEET_COUNT = 3

export const getSeasonLeaderboards = (dataset: CompetitionDataset) => {
  const gymnastMeets = new Map<
    string,
    {
      id: string
      name: string
      region: string
      meets: GymnastMeetScore[]
    }
  >()
  const teamBest = new Map<string, Omit<SeasonTeamStanding, 'rank'>>()
  const clubById = new Map(dataset.teams.map((team) => [team.id, team]))

  for (const competition of dataset.competitions) {
    const snapshot = getCompetitionSnapshot(dataset, competition.id)

    for (const gymnast of snapshot.gymnasts) {
      const club = clubById.get(gymnast.teamId)
      const current = gymnastMeets.get(gymnast.id)
      const meet: GymnastMeetScore = {
        total: gymnast.total,
        competitionId: competition.id,
        competitionName: competition.name,
        teamId: gymnast.teamId,
        teamName: gymnast.teamName,
      }
      if (!current) {
        gymnastMeets.set(gymnast.id, {
          id: gymnast.id,
          name: gymnast.name,
          region: club?.city ?? 'Unknown',
          meets: [meet],
        })
        continue
      }
      current.meets.push(meet)
      if (club?.city) current.region = club.city
    }

    for (const team of snapshot.teams) {
      const official = dataset.competitionTeams.find((item) => item.id === team.id)
      const clubId = official?.clubId ?? team.id
      const club = clubById.get(clubId)
      const current = teamBest.get(clubId)
      if (!current) {
        teamBest.set(clubId, {
          id: clubId,
          resultId: team.id,
          name: club?.name ?? team.name,
          color: club?.color ?? team.color,
          total: team.total,
          competitionId: competition.id,
          competitionName: competition.name,
          meets: 1,
        })
        continue
      }
      current.meets += 1
      if (team.total > current.total) {
        current.total = team.total
        current.resultId = team.id
        current.competitionId = competition.id
        current.competitionName = competition.name
      }
    }
  }

  const gymnasts = [...gymnastMeets.values()]
    .map((entry) => {
      const topMeets = [...entry.meets]
        .sort((a, b) => b.total - a.total)
        .slice(0, TOP_MEET_COUNT)
      const bestMeet = topMeets[0]
      return {
        id: entry.id,
        name: entry.name,
        teamId: bestMeet.teamId,
        teamName: bestMeet.teamName,
        region: entry.region,
        total: round(topMeets.reduce((sum, meet) => sum + meet.total, 0)),
        competitionId: bestMeet.competitionId,
        competitionName: bestMeet.competitionName,
        meets: entry.meets.length,
        scoredMeets: topMeets.length,
      }
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  const teams = [...teamBest.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  const regions = [...new Set(gymnasts.map((gymnast) => gymnast.region))].sort(
    (a, b) => a.localeCompare(b),
  )

  return { teams, gymnasts, regions }
}

export const getGymnastProgress = (
  dataset: CompetitionDataset,
  gymnast: Gymnast,
  apparatus: 'all' | Apparatus = 'all',
) =>
  [...dataset.competitions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((competition) => {
      const scores = dataset.scores.filter(
        (score) =>
          score.competitionId === competition.id && score.gymnastId === gymnast.id,
      )
      const byApparatus = Object.fromEntries(
        scores.map((score) => [score.apparatus, score.score]),
      ) as Partial<Record<Apparatus, number>>

      if (apparatus === 'all') {
        if (!hasFullAllAround(byApparatus)) return null
        return {
          competition: competition.name,
          date: competition.date,
          shortName: formatAxisDate(competition.date),
          total: round(APPARATUS.reduce((sum, item) => sum + byApparatus[item], 0)),
        }
      }

      const score = byApparatus[apparatus]
      if (typeof score !== 'number') return null
      return {
        competition: competition.name,
        date: competition.date,
        shortName: formatAxisDate(competition.date),
        total: round(score),
      }
    })
    .filter((result): result is NonNullable<typeof result> => result != null)

export const getTeamProgress = (
  dataset: CompetitionDataset,
  team: { id: string; name: string },
) => {
  const official = dataset.competitionTeams.find((item) => item.id === team.id)
  const clubId =
    official?.clubId ??
    (dataset.teams.some((item) => item.id === team.id) ? team.id : undefined)

  return [...dataset.competitions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((competition) => {
      const officialAtMeet = dataset.competitionTeams.filter(
        (item) => item.competitionId === competition.id,
      )

      if (officialAtMeet.length) {
        const matches = clubId
          ? officialAtMeet.filter((item) => item.clubId === clubId)
          : officialAtMeet.filter(
              (item) => item.id === team.id || item.name === team.name,
            )
        if (!matches.length) return null

        // Prefer this squad when present; otherwise the club's best total that meet.
        const selected =
          matches.find((item) => item.id === team.id) ??
          [...matches].sort((a, b) => b.total - a.total)[0]

        return {
          competition: competition.name,
          date: competition.date,
          shortName: formatAxisDate(competition.date),
          total: round(selected.total),
          rank: selected.rank,
          teamName: selected.name,
        }
      }

      const snapshot = getCompetitionSnapshot(dataset, competition.id)
      const derived = snapshot.teams.find(
        (item) => item.id === (clubId ?? team.id) || item.name === team.name,
      )
      if (!derived) return null

      return {
        competition: competition.name,
        date: competition.date,
        shortName: formatAxisDate(competition.date),
        total: derived.total,
        rank: derived.rank,
        teamName: derived.name,
      }
    })
    .filter((result): result is NonNullable<typeof result> => result != null)
}

export const getMostImproved = (dataset: CompetitionDataset) => {
  const results = dataset.gymnasts
    .map((gymnast) => {
      const progress = getGymnastProgress(dataset, gymnast)
      if (progress.length < 2) return null
      const first = progress[0]
      const last = progress[progress.length - 1]
      return {
        gymnast,
        change: round(last.total - first.total),
        from: first.competition,
        to: last.competition,
      }
    })
    .filter((result): result is NonNullable<typeof result> => result != null)
    .sort((a, b) => b.change - a.change)

  return results[0] ?? null
}
