# Google Sheets live data setup

ScoreStory can load competition results directly from a **Google Sheet** instead of manually re-importing an Excel file. Update the sheet and refresh the app — no code changes needed.

> **Google Docs vs Google Sheets:** Score data is tabular (ranks, scores, clubs). Use **Google Sheets**, not Google Docs. You can keep notes in Docs, but scores belong in Sheets.

## Quick setup

1. **Upload your workbook**
   - Open [Google Sheets](https://sheets.google.com)
   - File → Import → Upload → select `resources/Gymnastics data.xlsx`
   - Keep the existing tab names (individual result tabs + `Teams …` tabs)

2. **Share the spreadsheet**
   - Click **Share**
   - Set access to **Anyone with the link** → **Viewer**
   - This lets the app read scores without logging in

3. **Connect the app**
   - Copy `.env.example` to `.env.local`
   - Paste your spreadsheet ID into `VITE_GOOGLE_SHEETS_ID`:
     ```
     https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
     ```
   - Restart the dev server (`npm run dev`)

4. **Update scores**
   - Edit cells in Google Sheets as usual
   - In the app, click **Refresh scores** in the footer (or reload the page)

## Optional: API key

If sheet tab names are truncated differently than in Excel, add a Google Cloud API key:

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Enable **Google Sheets API**
2. Create an API key → restrict to **Google Sheets API** and your site domain
3. Add to `.env.local`:
   ```
   VITE_GOOGLE_API_KEY=your_key_here
   ```

## Deployment

Add the same environment variables to your hosting provider (Vercel, Netlify, etc.):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GOOGLE_SHEETS_ID` | Yes | Spreadsheet ID from the URL |
| `VITE_GOOGLE_API_KEY` | No | Helps list sheet tabs reliably |

Without `VITE_GOOGLE_SHEETS_ID`, the app uses the bundled `src/data/competitionData.ts` file (updated via `npm run import-data`).

## Sheet structure

The import expects the same layout as the Excel workbook:

- **Individual tabs** — header row with Rank, Name, Club, …, Vault, Bars, Beam, Floor
- **Team tabs** — rows marked `Team` / `Gymnast` with apparatus columns

Tab names are matched by prefix (e.g. `Counties Manukau Comp 1`).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Failed to load Google Sheet" | Check sharing is **Anyone with the link → Viewer** |
| Missing sheet error | Ensure tab names match the Excel workbook; try adding `VITE_GOOGLE_API_KEY` |
| App shows old data | Click **Refresh scores** or hard-reload the browser |
| CORS / network errors | Confirm the spreadsheet ID is correct and the sheet is not private |
