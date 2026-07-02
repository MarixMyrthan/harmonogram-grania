import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.110.0/cors'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getDefaultKey(jsonName: string, legacyName: string): string {
  const encoded = Deno.env.get(jsonName)
  if (encoded) {
    const parsed = JSON.parse(encoded) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  const legacy = Deno.env.get(legacyName)
  if (!legacy) throw new Error(`Missing ${jsonName}/${legacyName}`)
  return legacy
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function internalEmail(playerCode: string): string {
  return `${playerCode.toLowerCase()}@players.invalid`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json() as {
      activationCode?: string
      displayName?: string
      pin?: string
    }

    const activationCode = body.activationCode?.trim().toUpperCase() || ''
    const displayName = body.displayName?.trim() || ''
    const pin = body.pin || ''

    if (!/^AKTYWUJ-[A-F0-9]{16}$/.test(activationCode)) {
      return json({ error: 'Nieprawidłowy kod aktywacyjny.' }, 400)
    }
    if (displayName.length < 2 || displayName.length > 40) {
      return json({ error: 'Nazwa musi mieć od 2 do 40 znaków.' }, 400)
    }
    if (!/^\d{6}$/.test(pin)) {
      return json({ error: 'PIN musi składać się dokładnie z 6 cyfr.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const secretKey = getDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const activationHash = await sha256(activationCode)
    const { data: invite, error: inviteError } = await admin
      .from('player_invites')
      .select('id, player_code, expires_at, consumed_at')
      .eq('activation_hash', activationHash)
      .maybeSingle()

    if (inviteError) throw inviteError
    if (!invite || invite.consumed_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Kod jest nieprawidłowy, wykorzystany albo wygasł.' }, 400)
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail(invite.player_code),
      password: pin,
      email_confirm: true,
      user_metadata: { player_code: invite.player_code },
    })

    if (createError || !created.user) {
      return json({ error: 'Nie udało się utworzyć konta. Kod mógł zostać już użyty.' }, 409)
    }

    const userId = created.user.id
    const { error: profileError } = await admin.from('profiles').insert({
      id: userId,
      player_code: invite.player_code,
      display_name: displayName,
    })

    if (profileError) {
      await admin.auth.admin.deleteUser(userId)
      throw profileError
    }

    const { data: consumed, error: consumeError } = await admin
      .from('player_invites')
      .update({ consumed_at: new Date().toISOString(), consumed_by: userId })
      .eq('id', invite.id)
      .is('consumed_at', null)
      .select('id')
      .maybeSingle()

    if (consumeError || !consumed) {
      await admin.auth.admin.deleteUser(userId)
      return json({ error: 'Kod został właśnie użyty w innym miejscu.' }, 409)
    }

    return json({ playerCode: invite.player_code })
  } catch (error) {
    console.error(error)
    return json({ error: 'Wystąpił błąd serwera podczas aktywacji.' }, 500)
  }
})
