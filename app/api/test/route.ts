import { NextResponse } from 'next/server'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

export async function GET() {
  // Test 1: Supabase connectivity
  let sbStatus = 'unknown'
  try {
    const r = await fetch(`${SB}/rest/v1/firme?select=id&limit=1`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    })
    sbStatus = r.ok ? `OK (${r.status})` : `FAIL (${r.status}): ${await r.text()}`
  } catch(e) { sbStatus = 'EXCEPTION: ' + String(e) }

  // Test 2: Storage connectivity
  let storageStatus = 'unknown'
  try {
    const r = await fetch(`${SB}/storage/v1/bucket`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    })
    storageStatus = r.ok ? `OK (${r.status})` : `FAIL (${r.status}): ${await r.text()}`
  } catch(e) { storageStatus = 'EXCEPTION: ' + String(e) }

  // Test 3: Anthropic key present
  const anthropicStatus = ANTHROPIC_KEY ? `Present (${ANTHROPIC_KEY.slice(0,20)}...)` : 'MISSING'

  return NextResponse.json({
    supabase_db: sbStatus,
    supabase_storage: storageStatus,
    anthropic_key: anthropicStatus,
    env_vars: {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET - using hardcoded',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET',
    }
  })
}
