import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.110.0/cors'

type Action = 'status' | 'list' | 'invite' | 'set-active' | 'delete-user'

const headers = {
  ...corsHeaders,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
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

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = request.headers.get('Authorization') || ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!accessToken) return json({ error: 'Brak aktywnej sesji.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const secretKey = getDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
    const caller = authData.user
    if (authError || !caller) return json({ error: 'Sesja wygasła.' }, 401)

    const body = await request.json().catch(() => ({})) as {
      action?: Action
      userId?: string
      active?: boolean
    }

    const { data: adminRow, error: adminError } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', caller.id)
      .maybeSingle()

    if (adminError) throw adminError
    const isAdmin = Boolean(adminRow)

    if (body.action === 'status') return json({ isAdmin })
    if (!isAdmin) return json({ error: 'Brak uprawnień administratora.' }, 403)

    if (body.action === 'list') {
      const [{ data: profiles, error: profilesError }, { data: activity, error: activityError }, { data: admins, error: adminsError }] = await Promise.all([
        admin.from('profiles').select('id, player_code, display_name, avatar_path, is_active, created_at').order('display_name'),
        admin.from('user_activity').select('user_id, last_seen_at'),
        admin.from('admin_users').select('user_id'),
      ])

      if (profilesError) throw profilesError
      if (activityError) throw activityError
      if (adminsError) throw adminsError

      const lastSeen = new Map((activity || []).map((row) => [row.user_id, row.last_seen_at]))
      const adminIds = new Set((admins || []).map((row) => row.user_id))

      const users = await Promise.all((profiles || []).map(async (profile) => {
        let avatarUrl: string | null = null
        if (profile.avatar_path) {
          const { data } = await admin.storage.from('avatars').createSignedUrl(profile.avatar_path, 60 * 60)
          avatarUrl = data?.signedUrl || null
        }
        return {
          ...profile,
          avatar_url: avatarUrl,
          last_seen_at: lastSeen.get(profile.id) || null,
          is_admin: adminIds.has(profile.id),
        }
      }))

      return json({ users, server_time: new Date().toISOString() })
    }

    if (body.action === 'invite') {
      const { data, error } = await admin.rpc('issue_player_invite', { p_valid_for: '30 days' })
      if (error) throw error
      const invite = Array.isArray(data) ? data[0] : data
      if (!invite) throw new Error('Invite was not generated')
      return json({ invite })
    }

    if (body.action === 'set-active') {
      if (!isUuid(body.userId) || typeof body.active !== 'boolean') {
        return json({ error: 'Nieprawidłowe dane użytkownika.' }, 400)
      }
      if (body.userId === caller.id) return json({ error: 'Nie możesz zablokować własnego konta.' }, 409)

      const { data: targetAdmin } = await admin
        .from('admin_users')
        .select('user_id')
        .eq('user_id', body.userId)
        .maybeSingle()
      if (targetAdmin) return json({ error: 'Nie można zablokować konta administratora.' }, 409)

      const { error } = await admin
        .from('profiles')
        .update({ is_active: body.active })
        .eq('id', body.userId)
      if (error) throw error

      if (!body.active) await admin.from('user_activity').delete().eq('user_id', body.userId)
      return json({ ok: true })
    }

    if (body.action === 'delete-user') {
      if (!isUuid(body.userId)) return json({ error: 'Nieprawidłowy użytkownik.' }, 400)
      if (body.userId === caller.id) return json({ error: 'Nie możesz usunąć własnego konta.' }, 409)

      const { data: targetAdmin } = await admin
        .from('admin_users')
        .select('user_id')
        .eq('user_id', body.userId)
        .maybeSingle()
      if (targetAdmin) return json({ error: 'Nie można usunąć konta administratora.' }, 409)

      const { data: files } = await admin.storage.from('avatars').list(body.userId, { limit: 100 })
      if (files?.length) {
        await admin.storage.from('avatars').remove(files.map((file) => `${body.userId}/${file.name}`))
      }

      const { error } = await admin.auth.admin.deleteUser(body.userId)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Nieznana operacja.' }, 400)
  } catch (error) {
    console.error(error)
    return json({ error: 'Wystąpił błąd serwera panelu administratora.' }, 500)
  }
})
