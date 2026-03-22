import 'dotenv/config'
import { readFileSync } from 'fs'
import { getDb } from '../db.js'
import { crmDeals } from '../../../db/schema.js'

const CSV_PATH = '/Users/axelpach/Downloads/Pilot hunt 💥 - Kanban View.csv'

// Known person names (vs company names) — these get a contact, the rest become deals with company-style titles
const PERSON_NAMES = [
  'Jorge Hachity',
  'Johnatan Brujo',
  'Santiago Jiménez',
  'Mario Méndez',
  'Benoit Duez',
  'Carlos Benavides',
  'José Alfredo Soriano',
  'Zavia Zavaleta',
]

function parseCsv(content: string) {
  const lines = content.trim().split('\n')
  // Skip header
  return lines.slice(1).map((line) => {
    // Simple CSV parse (handles quoted fields)
    const matches = line.match(/"([^"]*)"/g)
    if (!matches || matches.length < 3) return null
    return {
      entryId: matches[0].replace(/"/g, ''),
      recordId: matches[1].replace(/"/g, ''),
      name: matches[2].replace(/"/g, '').trim(),
    }
  }).filter(Boolean) as { entryId: string; recordId: string; name: string }[]
}

async function importData() {
  const db = getDb()
  const content = readFileSync(CSV_PATH, 'utf-8')
  const records = parseCsv(content)

  console.log(`Found ${records.length} records to import`)

  let imported = 0
  for (const record of records) {
    // All entries become deals with stage 'prospecto'
    // Project = ardia (this is Ardia's sales pipeline)
    await db.insert(crmDeals).values({
      title: record.name,
      stage: 'prospecto',
      project: 'ardia',
      temperature: 'warm',
    }).onConflictDoNothing()

    imported++
    console.log(`  [${imported}/${records.length}] ${record.name}`)
  }

  console.log(`\nImported ${imported} deals into Pachi CRM`)
  process.exit(0)
}

importData().catch(console.error)
