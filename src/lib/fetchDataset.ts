import { INDIVIDUAL_SHEETS, TEAM_SHEETS } from './importConfig'
import { parseSheetData, type SheetData } from './parseSheets'
import type { CompetitionDataset } from '../data/types'

type GvizCell = { v?: string | number | null; f?: string }
type GvizResponse = {
  status: string
  errors?: { message: string }[]
  table?: { rows: { c: (GvizCell | null)[] }[] }
}

const SHEET_PREFIXES = [
  ...INDIVIDUAL_SHEETS.map((item) => item.sheet),
  ...TEAM_SHEETS.map((item) => item.sheet),
]

const gvizUrl = (spreadsheetId: string, sheetName: string, apiKey?: string) => {
  const params = new URLSearchParams({ tqx: 'out:json', sheet: sheetName })
  if (apiKey) params.set('key', apiKey)
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${params}`
}

const parseGvizResponse = (text: string): (string | number | null)[][] => {
  const jsonText = text.replace(/^[^{]*/, '').replace(/\);?\s*$/, '')
  const payload = JSON.parse(jsonText) as GvizResponse
  if (payload.status !== 'ok') {
    const message = payload.errors?.[0]?.message ?? 'Failed to read sheet'
    throw new Error(message)
  }
  return (payload.table?.rows ?? []).map((row) =>
    (row.c ?? []).map((cell) => {
      if (!cell) return null
      const value = cell.v
      if (value == null) return null
      if (typeof value === 'string' && value.startsWith('Date(')) {
        const match = value.match(/Date\((\d+),(\d+),(\d+)\)/)
        if (match) {
          const [, year, month, day] = match
          return `${year}-${String(Number(month) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
      }
      return value
    }),
  )
}

const fetchSheet = async (
  spreadsheetId: string,
  sheetPrefix: string,
  apiKey?: string,
): Promise<{ name: string; rows: (string | number | null)[][] }> => {
  const candidates = [sheetPrefix.trim(), sheetPrefix]
  let lastError: Error | null = null

  for (const candidate of candidates) {
    try {
      const response = await fetch(gvizUrl(spreadsheetId, candidate, apiKey))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const rows = parseGvizResponse(await response.text())
      if (!rows.length) throw new Error('Sheet is empty')
      return { name: candidate, rows }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error(`Could not load sheet "${sheetPrefix}"`)
}

const listSheetTitles = async (spreadsheetId: string, apiKey: string): Promise<string[]> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title&key=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not list sheets (HTTP ${response.status})`)
  const payload = (await response.json()) as {
    sheets?: { properties?: { title?: string } }[]
  }
  return (payload.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title))
}

const resolveSheetName = (prefix: string, titles: string[]): string => {
  if (titles.includes(prefix)) return prefix
  const match = titles.find((title) => title.startsWith(prefix.trim()))
  if (!match) throw new Error(`Missing sheet starting with "${prefix}"`)
  return match
}

export const fetchDatasetFromGoogleSheets = async (
  spreadsheetId: string,
  apiKey?: string,
): Promise<CompetitionDataset> => {
  const sheets: SheetData = {}

  if (apiKey) {
    const titles = await listSheetTitles(spreadsheetId, apiKey)
    for (const prefix of SHEET_PREFIXES) {
      const sheetName = resolveSheetName(prefix, titles)
      const { rows } = await fetchSheet(spreadsheetId, sheetName, apiKey)
      sheets[sheetName] = rows
    }
  } else {
    for (const prefix of SHEET_PREFIXES) {
      const { name, rows } = await fetchSheet(spreadsheetId, prefix)
      sheets[name] = rows
    }
  }

  return parseSheetData(sheets)
}

export const getSpreadsheetId = (): string | undefined =>
  import.meta.env.VITE_GOOGLE_SHEETS_ID?.trim() || undefined

export const getGoogleApiKey = (): string | undefined =>
  import.meta.env.VITE_GOOGLE_API_KEY?.trim() || undefined
