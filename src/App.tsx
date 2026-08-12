import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Award, BarChart3, CalendarDays, ChevronDown, ChevronLeft, CircleHelp,
  MapPin, Medal, Sparkles, TrendingUp, Trophy, UserRound, Users, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import './App.css'
import type { CompetitionDataset } from './data/types'
import { APPARATUS, APPARATUS_LABELS, type Apparatus } from './data/types'
import { useDataset } from './hooks/useDataset'
import {
  getCompetitionSnapshot, getCompetitionSummaries, getGymnastProgress,
  getMostImproved, getSeasonLeaderboards, getTeamProgress,
  type SeasonGymnastStanding,
} from './lib/analytics'

type View = 'home' | 'overview' | 'teams' | 'gymnasts'

const VIEW_LABELS: Record<View, string> = {
  home: 'competitions',
  overview: 'overview',
  teams: 'teams',
  gymnasts: 'gymnasts',
}

const DEFAULT_REGION = 'Auckland'
const ALL_REGIONS = 'all'
const MOBILE_BREAKPOINT = 900
const MOBILE_LEADERBOARD_PREVIEW = 5

type ListOverlay = 'teams' | 'gymnasts' | null

const rankWithinRegion = (gymnasts: SeasonGymnastStanding[]) =>
  [...gymnasts]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((gymnast, index) => ({ ...gymnast, rank: index + 1 }))

const useIsMobile = (breakpoint = MOBILE_BREAKPOINT) => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => setIsMobile(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [breakpoint])

  return isMobile
}

type AppContentProps = {
  dataset: CompetitionDataset
  dataError: string | null
  dataSource: 'google-sheets' | 'static'
  lastUpdated: Date | null
  onRefresh: () => void
}

function App() {
  const { dataset, loading, error, source, lastUpdated, refresh } = useDataset()

  if (loading) {
    return (
      <div className="app-shell data-loading">
        <div className="data-loading-card">
          <span className="brand-mark"><TrendingUp size={20} /></span>
          <p className="eyebrow">ScoreStory</p>
          <h1>Loading results…</h1>
          <p>Fetching the latest scores from Google Sheets.</p>
        </div>
      </div>
    )
  }

  return (
    <AppContent
      dataset={dataset}
      dataError={error}
      dataSource={source}
      lastUpdated={lastUpdated}
      onRefresh={refresh}
    />
  )
}

function AppContent({ dataset, dataError, dataSource, lastUpdated, onRefresh }: AppContentProps) {
  const [view, setView] = useState<View>('home')
  const [competitionId, setCompetitionId] = useState(
    () => dataset.competitions.at(-1)?.id ?? '',
  )
  const snapshot = useMemo(() => getCompetitionSnapshot(dataset, competitionId), [dataset, competitionId])
  const competitionSummaries = useMemo(() => getCompetitionSummaries(dataset), [dataset])
  const seasonLeaderboards = useMemo(() => getSeasonLeaderboards(dataset), [dataset])
  const [teamId, setTeamId] = useState('all')
  const [gymnastId, setGymnastId] = useState('all')
  const [regionFilter, setRegionFilter] = useState(
    seasonLeaderboards.regions.includes(DEFAULT_REGION) ? DEFAULT_REGION : ALL_REGIONS,
  )
  const [progressApparatus, setProgressApparatus] = useState<'all' | Apparatus>('all')
  const [listOverlay, setListOverlay] = useState<ListOverlay>(null)
  const [compPickerOpen, setCompPickerOpen] = useState(false)
  const compPickerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const gymnastLeaderboardGroups = useMemo(() => {
    const filtered =
      regionFilter === ALL_REGIONS
        ? seasonLeaderboards.gymnasts
        : seasonLeaderboards.gymnasts.filter((gymnast) => gymnast.region === regionFilter)

    const regions =
      regionFilter === ALL_REGIONS
        ? seasonLeaderboards.regions
        : [regionFilter]

    return regions
      .map((region) => ({
        region,
        gymnasts: rankWithinRegion(
          filtered.filter((gymnast) => gymnast.region === region),
        ),
      }))
      .filter((group) => group.gymnasts.length > 0)
  }, [regionFilter, seasonLeaderboards])
  const previewTeamStandings = isMobile
    ? seasonLeaderboards.teams.slice(0, MOBILE_LEADERBOARD_PREVIEW)
    : seasonLeaderboards.teams
  const previewGymnastGroups = useMemo(() => {
    if (!isMobile) return gymnastLeaderboardGroups
    let remaining = MOBILE_LEADERBOARD_PREVIEW
    const groups = []
    for (const group of gymnastLeaderboardGroups) {
      if (remaining <= 0) break
      const gymnasts = group.gymnasts.slice(0, remaining)
      remaining -= gymnasts.length
      groups.push({ ...group, gymnasts })
    }
    return groups
  }, [gymnastLeaderboardGroups, isMobile])
  const gymnastStandingCount = useMemo(
    () => gymnastLeaderboardGroups.reduce((sum, group) => sum + group.gymnasts.length, 0),
    [gymnastLeaderboardGroups],
  )
  const competition = dataset.competitions.find((item) => item.id === competitionId)!
  const showAllTeams = teamId === 'all'
  const showAllGymnasts = gymnastId === 'all'
  const selectedTeam = snapshot.teams.find((team) => team.id === teamId) ?? snapshot.teams[0]
  const selectedGymnast = snapshot.gymnasts.find((gymnast) => gymnast.id === gymnastId) ?? snapshot.gymnasts[0]
  const gymnastRecord = dataset.gymnasts.find((gymnast) => gymnast.id === selectedGymnast?.id)
  const gymnastClub = dataset.teams.find((team) => team.id === selectedGymnast?.teamId)
  const clubColor = (clubId: string) =>
    dataset.teams.find((team) => team.id === clubId)?.color ?? '#77718a'
  const mostImproved = useMemo(() => getMostImproved(dataset), [dataset])
  const teamProgress = useMemo(
    () => (selectedTeam ? getTeamProgress(dataset, selectedTeam) : []),
    [dataset, selectedTeam],
  )

  useEffect(() => {
    if (!dataset.competitions.length) return
    const latestId = dataset.competitions.at(-1)!.id
    if (!dataset.competitions.some((item) => item.id === competitionId)) {
      setCompetitionId(latestId)
    }
  }, [dataset, competitionId])
  const teamTotalNote = snapshot.teamsOfficial
    ? 'Official team totals from the competition score sheets.'
    : 'Team totals use the top three scores on each apparatus.'
  const contributionNote = snapshot.teamsOfficial
    ? 'Contribution uses each gymnast’s scored apparatus total within their competition team.'
    : 'Contribution counts only scores included in the team total.'
  const teamProgressNote =
    teamProgress.length > 1
      ? 'Team total at each meet. When a club fielded more than one squad, the chart uses this squad if present, otherwise the club’s best total.'
      : 'Only one meet with a team total so far for this club.'
  const fieldAverageTotal = snapshot.teams.length
    ? snapshot.teams.reduce((sum, team) => sum + team.total, 0) / snapshot.teams.length
    : 0
  const closestTeamGap = snapshot.teams.length > 1
    ? snapshot.teams[0].total - snapshot.teams[1].total
    : 0
  const fieldAverageAllAround = snapshot.gymnasts.length
    ? snapshot.gymnasts.reduce((sum, gymnast) => sum + gymnast.total, 0) / snapshot.gymnasts.length
    : 0
  const closestGymnastGap = snapshot.gymnasts.length > 1
    ? snapshot.gymnasts[0].total - snapshot.gymnasts[1].total
    : 0

  const openCompetition = (id: string) => {
    setCompetitionId(id)
    setTeamId('all')
    setGymnastId('all')
    setView('overview')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openTeam = (id: string, fromCompetitionId = competitionId) => {
    setListOverlay(null)
    setCompetitionId(fromCompetitionId)
    setTeamId(id)
    setView('teams')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openGymnast = (id: string, fromCompetitionId = competitionId) => {
    setListOverlay(null)
    setCompetitionId(fromCompetitionId)
    setGymnastId(id)
    setView('gymnasts')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    if (!listOverlay) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setListOverlay(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [listOverlay])

  useEffect(() => {
    if (!compPickerOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!compPickerRef.current?.contains(event.target as Node)) {
        setCompPickerOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompPickerOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [compPickerOpen])

  useEffect(() => {
    setCompPickerOpen(false)
  }, [view, competitionId])

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setView('home')} aria-label="Go to competitions">
          <span className="brand-mark"><TrendingUp size={20} /></span>
          <span>Score<span>Story</span></span>
        </button>
      </header>

      <main>
        {view !== 'home' && (
          <section className="competition-chrome">
            <button
              type="button"
              className="text-button back-to-competitions"
              onClick={() => setView('home')}
            >
              <ChevronLeft size={15} /> All Competitions
            </button>
            <div className="overview-title-row">
              <h1>{competition.name}</h1>
              <div className="comp-change" ref={compPickerRef}>
                <button
                  type="button"
                  className="text-button comp-change-trigger"
                  aria-expanded={compPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setCompPickerOpen((open) => !open)}
                >
                  Change <ChevronDown size={14} />
                </button>
                {compPickerOpen && (
                  <ul className="comp-change-menu" role="listbox" aria-label="Competitions">
                    {dataset.competitions.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={item.id === competitionId}
                          className={item.id === competitionId ? 'active' : ''}
                          onClick={() => {
                            setCompetitionId(item.id)
                            setTeamId('all')
                            setGymnastId('all')
                            setCompPickerOpen(false)
                          }}
                        >
                          <span>{item.name}</span>
                          <small>
                            {new Date(item.date).toLocaleDateString('en-NZ', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <nav className="competition-tabs" aria-label="Main navigation">
              {(['overview', 'teams', 'gymnasts'] as View[]).map((item) => (
                <button
                  className={view === item ? 'active' : ''}
                  onClick={() => {
                    if (item === 'teams') setTeamId('all')
                    if (item === 'gymnasts') setGymnastId('all')
                    setView(item)
                  }}
                  key={item}
                >
                  {VIEW_LABELS[item]}
                </button>
              ))}
            </nav>
          </section>
        )}
        {view === 'home' && (
          <>
            <section className="hero-section">
              <div>
                <p className="kicker">Season home</p>
                <h1>Every meet. <em>One place.</em></h1>
                <p className="hero-copy">
                  Browse the season, open a competition, and follow the scores that shaped each story.
                </p>
                <div className="competition-meta">
                  <span><Trophy size={15} />{competitionSummaries.length} competitions</span>
                  <span><UserRound size={15} />{dataset.gymnasts.length} gymnasts</span>
                  <span><Users size={15} />{dataset.teams.length} teams</span>
                </div>
              </div>
              <div className="hero-orbit" aria-hidden="true">
                <div className="orbit orbit-one" /><div className="orbit orbit-two" />
                <div className="hero-score">
                  <strong>{competitionSummaries.length}</strong>
                  <span>meets this<br />season</span>
                </div>
                <Sparkles className="spark spark-one" /><Sparkles className="spark spark-two" />
              </div>
            </section>

            <section className="section-block home-competitions">
              <div className="section-heading">
                <div>
                  <p className="kicker">Browse the season</p>
                  <h2>All competitions</h2>
                </div>
                <span className="method-link"><CircleHelp size={15} /> Open a meet to see the full story</span>
              </div>
              <div className="competition-list">
                {competitionSummaries.map(({ competition: item, gymnastCount, teamCount, topGymnast }) => (
                  <button
                    className="competition-card"
                    onClick={() => openCompetition(item.id)}
                    key={item.id}
                  >
                    <div className="competition-card-main">
                      <p className="eyebrow">{item.category} · {item.level}</p>
                      <h2>{item.name}</h2>
                      <div className="competition-card-meta">
                        <span><CalendarDays size={14} />{new Date(item.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        <span><MapPin size={14} />{item.location}</span>
                      </div>
                    </div>
                    <div className="competition-card-stats">
                      <div><strong>{gymnastCount}</strong><span>gymnasts</span></div>
                      <div><strong>{teamCount}</strong><span>teams</span></div>
                      {topGymnast && (
                        <div className="competition-card-leader">
                          <span>All-around lead</span>
                          <strong>{topGymnast.name}</strong>
                          <small>{topGymnast.total.toFixed(3)}</small>
                        </div>
                      )}
                    </div>
                    <span className="competition-card-action">Open <ArrowRight size={16} /></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="section-block home-leaderboards">
              <div className="split-section home-season-leaderboards">
                <div className="panel">
                  <div className="panel-heading">
                    <div><p className="kicker">Team standings</p><h2>Leaderboard</h2></div>
                    <button className="text-button" onClick={() => { setTeamId('all'); setView('teams') }}>
                      Explore teams <ArrowRight />
                    </button>
                  </div>
                  <div className="leaderboard">
                    {previewTeamStandings.map((team) => (
                      <button className="leader-row" onClick={() => openTeam(team.resultId, team.competitionId)} key={team.id}>
                        <span className={`rank rank-${team.rank}`}>{team.rank <= 3 ? <Medal size={17} /> : team.rank}</span>
                        <span className="team-dot" style={{ background: team.color }} />
                        <span className="leader-name"><strong>{team.name}</strong><small>Best at {team.competitionName}</small></span>
                        <span className="leader-score">{team.total.toFixed(3)}</span><ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                  {isMobile && seasonLeaderboards.teams.length > MOBILE_LEADERBOARD_PREVIEW && (
                    <button className="view-all-button" onClick={() => setListOverlay('teams')}>
                      View all <ArrowRight size={16} />
                    </button>
                  )}
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <div><p className="kicker">Gymnast</p><h2>Leaderboard</h2></div>
                    <button className="text-button" onClick={() => { setGymnastId('all'); setView('gymnasts') }}>
                      Explore gymnasts <ArrowRight />
                    </button>
                  </div>
                  <label className="region-filter">
                    <MapPin size={15} />
                    <select
                      value={regionFilter}
                      onChange={(event) => setRegionFilter(event.target.value)}
                      aria-label="Filter gymnast leaderboard by region"
                    >
                      <option value={ALL_REGIONS}>All regions</option>
                      {seasonLeaderboards.regions.map((region) => (
                        <option value={region} key={region}>{region}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <p className="chart-note leaderboard-method">
                    <CircleHelp size={14} />
                    Ranked by the sum of each gymnast’s top 3 all-around scores this season.
                  </p>
                  <div className="leaderboard region-leaderboard">
                    {previewGymnastGroups.length === 0 ? (
                      <p className="leaderboard-empty">No gymnasts in this region yet.</p>
                    ) : (
                      previewGymnastGroups.map((group) => (
                        <div className="region-group" key={group.region}>
                          <p className="region-group-label">{group.region}</p>
                          {group.gymnasts.map((gymnast) => (
                            <button
                              className="leader-row"
                              onClick={() => openGymnast(gymnast.id, gymnast.competitionId)}
                              key={gymnast.id}
                            >
                              <span className={`rank rank-${gymnast.rank}`}>
                                {gymnast.rank <= 3 ? <Medal size={17} /> : gymnast.rank}
                              </span>
                              <span className="team-dot" style={{ background: clubColor(gymnast.teamId) }} />
                              <span className="leader-name">
                                <strong>{gymnast.name}</strong>
                                <small>
                                  {gymnast.teamName} · Top {gymnast.scoredMeets}{' '}
                                  {gymnast.scoredMeets === 1 ? 'meet' : 'meets'}
                                </small>
                              </span>
                              <span className="leader-score">{gymnast.total.toFixed(3)}</span>
                              <ArrowRight size={16} />
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                  {isMobile && gymnastStandingCount > MOBILE_LEADERBOARD_PREVIEW && (
                    <button className="view-all-button" onClick={() => setListOverlay('gymnasts')}>
                      View all <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {view === 'overview' && (
          <>
            <div className="competition-meta overview-meta">
              <span><CalendarDays size={15} />{new Date(competition.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span><MapPin size={15} />{competition.location}</span>
              <span><UserRound size={15} />{competition.category} · {competition.level}</span>
            </div>

            <section className="champion-grid">
              <div className="champion-column">
                <div className="champion-stack">
                  <button className="champion-card team-champion" onClick={() => openTeam(snapshot.teams[0].id)}>
                    <div className="champion-top"><span className="champion-icon"><Trophy /></span><span className="eyebrow">Top team</span><ArrowRight /></div>
                    <div className="champion-body">
                      <div><p className="place">1st place</p><h2>{snapshot.teams[0].name}</h2><p>Strongest on {APPARATUS_LABELS[snapshot.teams[0].strongest]} · {snapshot.teams[0].reliance}% top-athlete reliance</p></div>
                      <strong className="big-score">{snapshot.teams[0].total.toFixed(3)}</strong>
                    </div>
                  </button>
                  <div className="podium-list">
                    {snapshot.teams.slice(1, 3).map((team) => (
                      <button className="podium-row" onClick={() => openTeam(team.id)} key={team.id}>
                        <span className={`rank rank-${team.rank}`}>{team.rank === 2 || team.rank === 3 ? <Medal size={15} /> : team.rank}</span>
                        <span className="team-dot" style={{ background: team.color }} />
                        <span className="leader-name"><strong>{team.name}</strong><small>Best on {APPARATUS_LABELS[team.strongest]}</small></span>
                        <span className="leader-score">{team.total.toFixed(3)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="champion-column">
                <div className="champion-stack">
                  <button className="champion-card gymnast-champion" onClick={() => openGymnast(snapshot.gymnasts[0].id)}>
                    <div className="champion-top"><span className="champion-icon"><Medal /></span><span className="eyebrow">Top gymnast</span><ArrowRight /></div>
                    <div className="champion-body">
                      <div><p className="place">All-around champion</p><h2>{snapshot.gymnasts[0].name}</h2><p>{snapshot.gymnasts[0].teamName} · {snapshot.gymnasts[0].average.toFixed(3)} average</p></div>
                      <strong className="big-score">{snapshot.gymnasts[0].total.toFixed(3)}</strong>
                    </div>
                  </button>
                  <div className="podium-list">
                    {snapshot.gymnasts.slice(1, 6).map((gymnast) => (
                      <button className="podium-row" onClick={() => openGymnast(gymnast.id)} key={gymnast.id}>
                        <span className={`rank rank-${gymnast.rank}`}>{gymnast.rank === 2 || gymnast.rank === 3 ? <Medal size={15} /> : gymnast.rank}</span>
                        <span className="team-dot" style={{ background: clubColor(gymnast.teamId) }} />
                        <span className="leader-name"><strong>{gymnast.name}</strong><small>{gymnast.teamName}</small></span>
                        <span className="leader-score">{gymnast.total.toFixed(3)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="split-section section-block">
              <div className="panel">
                <div className="panel-heading"><div><p className="kicker">Team standings</p><h2>Leaderboard</h2></div><button className="text-button" onClick={() => { setTeamId('all'); setView('teams') }}>Explore teams <ArrowRight /></button></div>
                <div className="leaderboard">
                  {snapshot.teams.map((team) => (
                    <button className="leader-row" onClick={() => openTeam(team.id)} key={team.id}>
                      <span className={`rank rank-${team.rank}`}>{team.rank <= 3 ? <Medal size={17} /> : team.rank}</span>
                      <span className="team-dot" style={{ background: team.color }} />
                      <span className="leader-name"><strong>{team.name}</strong><small>Best on {APPARATUS_LABELS[team.strongest]}</small></span>
                      <span className="leader-score">{team.total.toFixed(3)}</span><ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel apparatus-panel">
                <div className="panel-heading"><div><p className="kicker">Best in show</p><h2>Apparatus highs</h2></div></div>
                <div className="apparatus-highs">
                  {APPARATUS.map((item) => {
                    const gymnast = snapshot.topScores[item]
                    return (
                      <button key={item} onClick={() => openGymnast(gymnast.id)}>
                        <span>{APPARATUS_LABELS[item]}</span><strong>{gymnast.scores[item].toFixed(3)}</strong>
                        <small>{gymnast.name}</small><i style={{ width: `${(gymnast.scores[item] / 15) * 100}%` }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            {mostImproved && mostImproved.change > 0 && (
              <section className="improved-banner">
                <span className="banner-icon"><TrendingUp /></span>
                <div><p className="eyebrow">Most improved across competitions</p><h2>{mostImproved.gymnast.name}</h2><p>Added {mostImproved.change.toFixed(3)} points to her all-around total from {mostImproved.from} to {mostImproved.to}.</p></div>
                <button onClick={() => openGymnast(mostImproved.gymnast.id)}>View progress <ArrowRight /></button>
              </section>
            )}
          </>
        )}

        {view === 'teams' && (
          <section className="detail-page">
            <div className="selector-row">
              <button className={showAllTeams ? 'selected' : ''} onClick={() => setTeamId('all')}>
                <span style={{ background: 'linear-gradient(135deg, #5b50e6, #ed6a5a)' }} />All teams<small>{snapshot.teams.length}</small>
              </button>
              {snapshot.teams.map((team) => (
                <button className={!showAllTeams && selectedTeam.id === team.id ? 'selected' : ''} onClick={() => setTeamId(team.id)} key={team.id}>
                  <span style={{ background: team.color }} />{team.name}<small>#{team.rank}</small>
                </button>
              ))}
            </div>
            {showAllTeams ? (
              <>
                <div className="profile-heading">
                  <div className="profile-identity"><span className="profile-mark" style={{ background: 'linear-gradient(135deg, #5b50e6, #ed6a5a)' }}>ALL</span><div><p className="eyebrow">Field overview</p><h2>All teams</h2></div></div>
                  <div className="profile-stat"><strong>{snapshot.teams.length}</strong><span>teams competing</span></div>
                  <div className="profile-stat"><strong>{fieldAverageTotal.toFixed(3)}</strong><span>average team total</span></div>
                  <div className="profile-stat"><strong>{closestTeamGap.toFixed(3)}</strong><span>gap to 2nd</span></div>
                </div>
                <article className="panel" style={{ marginTop: 14 }}>
                  <div className="panel-heading"><div><p className="kicker">Standings</p><h2>Every team</h2></div></div>
                  <div className="leaderboard">
                    {snapshot.teams.map((team) => (
                      <button className="leader-row" onClick={() => setTeamId(team.id)} key={team.id}>
                        <span className={`rank rank-${team.rank}`}>{team.rank <= 3 ? <Medal size={17} /> : team.rank}</span>
                        <span className="team-dot" style={{ background: team.color }} />
                        <span className="leader-name"><strong>{team.name}</strong><small>Best on {APPARATUS_LABELS[team.strongest]}</small></span>
                        <span className="leader-score">{team.total.toFixed(3)}</span><ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                </article>
                {snapshot.teams[0] && (
                  <article className="team-story">
                    <Sparkles />
                    <div><p className="eyebrow">The field story</p><h2>{snapshot.teams[0].name} leads the way.</h2><p>{snapshot.teams.length} teams contested {competition.name}. {snapshot.teams[0].name} sits first on {snapshot.teams[0].total.toFixed(3)}, with {APPARATUS_LABELS[snapshot.teams[0].strongest].toLowerCase()} as their strongest apparatus. Select a team above to dig into strength and progress.</p></div>
                  </article>
                )}
              </>
            ) : (
              <>
                <div className="profile-heading">
                  <div className="profile-identity"><span className="profile-mark" style={{ background: selectedTeam.color }}>{selectedTeam.shortName}</span><div><p className="eyebrow">Rank #{selectedTeam.rank}</p><h2>{selectedTeam.name}</h2></div></div>
                  <div className="profile-stat"><strong>{selectedTeam.total.toFixed(3)}</strong><span>team total</span></div>
                  <div className="profile-stat"><strong>{selectedTeam.reliance}%</strong><span>top gymnast reliance</span></div>
                  <div className="profile-stat"><strong>{selectedTeam.depth.toFixed(3)}</strong><span>depth gap</span></div>
                </div>
                <div className="detail-grid">
                  <article className="panel chart-panel">
                    <div className="panel-heading"><div><p className="kicker">Apparatus profile</p><h2>Strength at a glance</h2></div></div>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={APPARATUS.map((item) => ({ name: APPARATUS_LABELS[item], score: selectedTeam.apparatus[item], average: snapshot.teams.reduce((sum, team) => sum + team.apparatus[item], 0) / snapshot.teams.length }))} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e6e1" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#716f69', fontSize: 12 }} />
                        <YAxis domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} tick={{ fill: '#9a9892', fontSize: 11 }} />
                        <Tooltip cursor={{ fill: '#f4f2ed' }} />
                        <Bar dataKey="average" fill="#dedbd3" radius={[5, 5, 0, 0]} name="Field average" />
                        <Bar dataKey="score" fill={selectedTeam.color} radius={[5, 5, 0, 0]} name={selectedTeam.name} />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="chart-note"><CircleHelp size={14} /> {teamTotalNote}</p>
                  </article>
                  <article className="panel chart-panel">
                    <div className="panel-heading"><div><p className="kicker">Across competitions</p><h2>Progress over time</h2></div></div>
                    {teamProgress.length ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={teamProgress} margin={{ top: 16, right: 20, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e6e1" />
                          <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fill: '#716f69', fontSize: 12 }} />
                          <YAxis domain={['dataMin - 5', 'dataMax + 5']} axisLine={false} tickLine={false} tick={{ fill: '#9a9892', fontSize: 11 }} />
                          <Tooltip
                            formatter={(value) => [Number(value).toFixed(3), 'Team total']}
                            labelFormatter={(_label, payload) => {
                              const point = payload?.[0]?.payload
                              if (!point) return ''
                              return `${point.competition}${point.teamName ? ` · ${point.teamName}` : ''}`
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="total"
                            stroke={selectedTeam.color}
                            strokeWidth={3}
                            dot={{ r: 5, fill: selectedTeam.color, strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="chart-note">No team totals found across competitions for this club yet.</p>
                    )}
                    <p className="chart-note"><CircleHelp size={14} /> {teamProgressNote}</p>
                  </article>
                </div>
                <article className="team-story">
                  <Sparkles />
                  <div><p className="eyebrow">The team story</p><h2>{APPARATUS_LABELS[selectedTeam.strongest]} set the pace.</h2><p>{selectedTeam.name} scored {selectedTeam.apparatus[selectedTeam.strongest].toFixed(3)} there, while {APPARATUS_LABELS[selectedTeam.weakest].toLowerCase()} was their lowest apparatus at {selectedTeam.apparatus[selectedTeam.weakest].toFixed(3)}. A {selectedTeam.depth.toFixed(3)}-point gap between their first and third all-around gymnasts indicates {selectedTeam.depth < 1 ? 'strong scoring depth' : 'greater reliance on the leading performers'}.</p></div>
                </article>
              </>
            )}
          </section>
        )}

        {view === 'gymnasts' && (
          <section className="detail-page">
            <label className="gymnast-picker">
              <Users size={18} /><span>Choose a gymnast</span>
              <select value={showAllGymnasts ? 'all' : selectedGymnast.id} onChange={(event) => setGymnastId(event.target.value)}>
                <option value="all">All gymnasts</option>
                {snapshot.gymnasts.map((gymnast) => <option value={gymnast.id} key={gymnast.id}>{gymnast.name} — #{gymnast.rank}</option>)}
              </select><ChevronDown size={16} />
            </label>
            {showAllGymnasts ? (
              <>
                <div className="profile-heading gymnast-profile-heading">
                  <div className="profile-identity"><span className="avatar large" style={{ background: 'linear-gradient(135deg, #ed6a5a, #d89b2b)' }}>ALL</span><div><p className="eyebrow">Field overview</p><h2>All gymnasts</h2></div></div>
                  <div className="profile-stat"><strong>{snapshot.gymnasts.length}</strong><span>gymnasts competing</span></div>
                  <div className="profile-stat"><strong>{fieldAverageAllAround.toFixed(3)}</strong><span>average all-around</span></div>
                  <div className="profile-stat"><strong>{closestGymnastGap.toFixed(3)}</strong><span>gap to 2nd</span></div>
                </div>
                <div className="detail-grid">
                  <article className="panel chart-panel">
                    <div className="panel-heading"><div><p className="kicker">All-around totals</p><h2>How the field stacks up</h2></div></div>
                    <ResponsiveContainer width="100%" height={Math.max(280, Math.min(snapshot.gymnasts.length, 18) * 34)}>
                      <BarChart
                        data={snapshot.gymnasts.slice(0, 18).map((gymnast) => ({
                          name: gymnast.name.split(' ')[0],
                          fullName: gymnast.name,
                          score: gymnast.total,
                          fill: clubColor(gymnast.teamId),
                        }))}
                        layout="vertical"
                        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8e6e1" />
                        <XAxis type="number" domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} tick={{ fill: '#9a9892', fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={62} axisLine={false} tickLine={false} tick={{ fill: '#716f69', fontSize: 11 }} />
                        <Tooltip
                          cursor={{ fill: '#f4f2ed' }}
                          formatter={(value) => [Number(value).toFixed(3), 'All-around']}
                          labelFormatter={(_label, payload) => String(payload?.[0]?.payload?.fullName ?? '')}
                        />
                        <Bar dataKey="score" radius={[0, 5, 5, 0]} name="All-around">
                          {snapshot.gymnasts.slice(0, 16).map((gymnast) => (
                            <Cell
                              key={gymnast.id}
                              fill={clubColor(gymnast.teamId)}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="chart-note"><CircleHelp size={14} /> Showing the top {Math.min(16, snapshot.gymnasts.length)} all-around totals for this competition.</p>
                  </article>
                  <article className="panel">
                    <div className="panel-heading"><div><p className="kicker">Standings</p><h2>Every gymnast</h2></div></div>
                    <div className="leaderboard">
                      {snapshot.gymnasts.map((gymnast) => (
                          <button className="leader-row" onClick={() => setGymnastId(gymnast.id)} key={gymnast.id}>
                            <span className={`rank rank-${gymnast.rank}`}>{gymnast.rank <= 3 ? <Medal size={17} /> : gymnast.rank}</span>
                            <span className="team-dot" style={{ background: clubColor(gymnast.teamId) }} />
                            <span className="leader-name"><strong>{gymnast.name}</strong><small>{gymnast.teamName}</small></span>
                            <span className="leader-score">{gymnast.total.toFixed(3)}</span><ArrowRight size={16} />
                          </button>
                      ))}
                    </div>
                  </article>
                </div>
                {snapshot.gymnasts[0] && (
                  <article className="team-story">
                    <Sparkles />
                    <div><p className="eyebrow">The field story</p><h2>{snapshot.gymnasts[0].name} leads the all-around.</h2><p>{snapshot.gymnasts.length} gymnasts contested {competition.name}. {snapshot.gymnasts[0].name} sits first on {snapshot.gymnasts[0].total.toFixed(3)} for {snapshot.gymnasts[0].teamName}. Choose a gymnast above to see their scorecard and progress.</p></div>
                  </article>
                )}
              </>
            ) : (
              <>
                <div className="profile-heading gymnast-profile-heading">
                  <div className="profile-identity"><span className="avatar large" style={{ background: gymnastClub?.color ?? '#77718a' }}>{selectedGymnast.name.split(' ').map((part) => part[0]).join('')}</span><div><p className="eyebrow">All-around rank #{selectedGymnast.rank}</p><h2>{selectedGymnast.name}</h2><p>{selectedGymnast.teamName}{gymnastRecord?.age != null ? ` · Age ${gymnastRecord.age}` : ''}</p></div></div>
                  <div className="profile-stat"><strong>{selectedGymnast.total.toFixed(3)}</strong><span>all-around</span></div>
                  <div className="profile-stat"><strong>{selectedGymnast.average.toFixed(3)}</strong><span>average score</span></div>
                  <div className="profile-stat"><strong>{selectedGymnast.consistency.toFixed(3)}</strong><span>score variation</span></div>
                </div>
                <div className="detail-grid">
                  <article className="panel chart-panel">
                    <div className="panel-heading"><div><p className="kicker">Performance shape</p><h2>Against the field</h2></div></div>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={APPARATUS.map((item) => ({ apparatus: APPARATUS_LABELS[item], gymnast: selectedGymnast.scores[item], field: snapshot.gymnasts.reduce((sum, gymnast) => sum + gymnast.scores[item], 0) / snapshot.gymnasts.length }))} outerRadius="70%">
                        <PolarGrid stroke="#dfddd6" /><PolarAngleAxis dataKey="apparatus" tick={{ fill: '#55534e', fontSize: 12 }} />
                        <Radar name="Field average" dataKey="field" stroke="#a7a39a" fill="#d9d6ce" fillOpacity={0.35} />
                        <Radar name={selectedGymnast.name} dataKey="gymnast" stroke={gymnastClub?.color ?? '#77718a'} fill={gymnastClub?.color ?? '#77718a'} fillOpacity={0.28} /><Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                    <p className="chart-note"><CircleHelp size={14} /> A wider shape means a higher score on that apparatus.</p>
                  </article>
                  <article className="panel">
                    <div className="panel-heading"><div><p className="kicker">Scorecard</p><h2>Event by event</h2></div></div>
                    <div className="scorecard">
                      {APPARATUS.map((item) => {
                        const fieldAverage = snapshot.gymnasts.reduce((sum, gymnast) => sum + gymnast.scores[item], 0) / snapshot.gymnasts.length
                        const difference = selectedGymnast.scores[item] - fieldAverage
                        return (
                          <div key={item}><span><strong>{APPARATUS_LABELS[item]}</strong><small>{difference >= 0 ? '+' : ''}{difference.toFixed(3)} vs field</small></span><span className="score-track"><i style={{ width: `${(selectedGymnast.scores[item] / 15) * 100}%`, background: gymnastClub?.color ?? '#77718a' }} /></span><strong>{selectedGymnast.scores[item].toFixed(3)}</strong></div>
                        )
                      })}
                    </div>
                    <div className="plain-insight"><Award /><p><strong>{APPARATUS_LABELS[APPARATUS.reduce((best, item) => selectedGymnast.scores[item] > selectedGymnast.scores[best] ? item : best)]} was the highlight.</strong> This was {selectedGymnast.name.split(' ')[0]}’s highest score of the day.</p></div>
                  </article>
                </div>
                <div className="detail-grid lower-grid">
                  <article className="panel chart-panel">
                    <div className="panel-heading">
                      <div><p className="kicker">Across competitions</p><h2>Progress over time</h2></div>
                      <label className="region-filter progress-apparatus-filter">
                        <select
                          value={progressApparatus}
                          onChange={(event) => setProgressApparatus(event.target.value as 'all' | Apparatus)}
                          aria-label="Filter progress by apparatus"
                        >
                          <option value="all">All</option>
                          {APPARATUS.map((item) => (
                            <option value={item} key={item}>{APPARATUS_LABELS[item]}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={gymnastRecord ? getGymnastProgress(dataset, gymnastRecord, progressApparatus) : []} margin={{ top: 16, right: 20, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e6e1" />
                        <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fill: '#716f69', fontSize: 12 }} />
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} tick={{ fill: '#9a9892', fontSize: 11 }} />
                        <Tooltip
                          formatter={(value) => [
                            Number(value).toFixed(3),
                            progressApparatus === 'all' ? 'All-around' : APPARATUS_LABELS[progressApparatus],
                          ]}
                          labelFormatter={(_label, payload) => {
                            const point = payload?.[0]?.payload
                            if (!point) return ''
                            return point.competition
                          }}
                        />
                        <Line type="monotone" dataKey="total" stroke={gymnastClub?.color ?? '#77718a'} strokeWidth={3} dot={{ r: 5, fill: gymnastClub?.color ?? '#77718a', strokeWidth: 2, stroke: '#fff' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </article>
                  <article className="metric-explainer">
                    <BarChart3 /><p className="eyebrow">Contribution explained</p><strong>{selectedGymnast.contribution}%</strong>
                    <h2>of team counted score</h2><p>{contributionNote}</p>
                  </article>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <footer>
        <div className="brand"><span className="brand-mark"><TrendingUp size={18} /></span><span>Score<span>Story</span></span></div>
        <p>Clearer competition results, one story at a time.</p>
        <p className="sample-label">
          {dataSource === 'google-sheets'
            ? `Live from Google Sheets${lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}`
            : 'Individual and team results from competition score sheets'}
        </p>
        {dataSource === 'google-sheets' && (
          <button type="button" className="text-button data-refresh" onClick={onRefresh}>
            Refresh scores
          </button>
        )}
        {dataError && (
          <p className="data-error" role="status">
            Could not load Google Sheet ({dataError}). Showing saved copy.
          </p>
        )}
      </footer>

      {listOverlay && (
        <div
          className="list-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="list-overlay-title"
        >
          <div className="list-overlay-header">
            <div>
              <p className="kicker">{listOverlay === 'teams' ? 'Team standings' : 'Gymnast'}</p>
              <h2 id="list-overlay-title">Leaderboard</h2>
            </div>
            <button
              className="list-overlay-close"
              onClick={() => setListOverlay(null)}
              aria-label="Close leaderboard"
            >
              <X size={20} />
            </button>
          </div>
          <div className="list-overlay-body">
            {listOverlay === 'gymnasts' && (
              <>
                <label className="region-filter">
                  <MapPin size={15} />
                  <select
                    value={regionFilter}
                    onChange={(event) => setRegionFilter(event.target.value)}
                    aria-label="Filter gymnast leaderboard by region"
                  >
                    <option value={ALL_REGIONS}>All regions</option>
                    {seasonLeaderboards.regions.map((region) => (
                      <option value={region} key={region}>{region}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <p className="chart-note leaderboard-method">
                  <CircleHelp size={14} />
                  Ranked by the sum of each gymnast’s top 3 all-around scores this season.
                </p>
              </>
            )}
            {listOverlay === 'teams' ? (
              <div className="leaderboard">
                {seasonLeaderboards.teams.map((team) => (
                  <button className="leader-row" onClick={() => openTeam(team.resultId, team.competitionId)} key={team.id}>
                    <span className={`rank rank-${team.rank}`}>{team.rank <= 3 ? <Medal size={17} /> : team.rank}</span>
                    <span className="team-dot" style={{ background: team.color }} />
                    <span className="leader-name"><strong>{team.name}</strong><small>Best at {team.competitionName}</small></span>
                    <span className="leader-score">{team.total.toFixed(3)}</span><ArrowRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="leaderboard region-leaderboard">
                {gymnastLeaderboardGroups.length === 0 ? (
                  <p className="leaderboard-empty">No gymnasts in this region yet.</p>
                ) : (
                  gymnastLeaderboardGroups.map((group) => (
                    <div className="region-group" key={group.region}>
                      <p className="region-group-label">{group.region}</p>
                      {group.gymnasts.map((gymnast) => (
                        <button
                          className="leader-row"
                          onClick={() => openGymnast(gymnast.id, gymnast.competitionId)}
                          key={gymnast.id}
                        >
                          <span className={`rank rank-${gymnast.rank}`}>
                            {gymnast.rank <= 3 ? <Medal size={17} /> : gymnast.rank}
                          </span>
                          <span className="team-dot" style={{ background: clubColor(gymnast.teamId) }} />
                          <span className="leader-name">
                            <strong>{gymnast.name}</strong>
                            <small>
                              {gymnast.teamName} · Top {gymnast.scoredMeets}{' '}
                              {gymnast.scoredMeets === 1 ? 'meet' : 'meets'}
                            </small>
                          </span>
                          <span className="leader-score">{gymnast.total.toFixed(3)}</span>
                          <ArrowRight size={16} />
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
