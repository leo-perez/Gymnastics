import { useCallback, useEffect, useState } from 'react'
import { dataset as staticDataset } from '../data/competitionData'
import type { CompetitionDataset } from '../data/types'
import {
  fetchDatasetFromGoogleSheets,
  getGoogleApiKey,
  getSpreadsheetId,
} from '../lib/fetchDataset'

export type DatasetState = {
  dataset: CompetitionDataset
  loading: boolean
  error: string | null
  source: 'google-sheets' | 'static'
  lastUpdated: Date | null
  refresh: () => void
}

export const useDataset = (): DatasetState => {
  const spreadsheetId = getSpreadsheetId()
  const [dataset, setDataset] = useState<CompetitionDataset>(staticDataset)
  const [loading, setLoading] = useState(Boolean(spreadsheetId))
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'google-sheets' | 'static'>(
    spreadsheetId ? 'google-sheets' : 'static',
  )
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  useEffect(() => {
    if (!spreadsheetId) {
      setDataset(staticDataset)
      setLoading(false)
      setError(null)
      setSource('static')
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const next = await fetchDatasetFromGoogleSheets(spreadsheetId, getGoogleApiKey())
        if (cancelled) return
        setDataset(next)
        setSource('google-sheets')
        setLastUpdated(new Date())
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load Google Sheet'
        setError(message)
        setDataset(staticDataset)
        setSource('static')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [spreadsheetId, refreshToken])

  return { dataset, loading, error, source, lastUpdated, refresh }
}
