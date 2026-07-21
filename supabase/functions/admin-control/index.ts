import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.110.0/cors'

type Action =
  | 'status'
  | 'touch'
  | 'maintenance'
  | 'list'
  | 'invite'
  | 'set-active'
  | 'set-colorblind'
  | 'delete-user'
  | 'protected-days'
  | 'set-day-protection'
  | 'chat-cleanup-preview'
  | 'chat-cleanup'

type DeviceType = 'computer' | 'phone' | 'tablet' | 'unknown'
type OperatingSystem = 'windows' | 'android' | 'apple' | 'linux' | 'unknown'
type Browser = 'firefox' | 'chrome' | 'edge' | 'safari' | 'opera' | 'brave' | 'unknown'

const DEVICE_TYPES = new Set<DeviceType>(['computer', 'phone', 'tablet', 'unknown'])
const OPERATING_SYSTEMS = new Set<OperatingSystem>(['windows', 'android', 'apple', 'linux', 'unknown'])
const BROWSERS = new Set<Browser>(['firefox', 'chrome', 'edge', 'safari', 'opera', 'brave', 'unknown'])

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

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeDays(value: unknown): number | null {
  const resolved = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(resolved) && resolved >= 1 && resolved <= 3650 ? resolved : null
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
      enabled?: boolean
      day?: string
      protected?: boolean
      days?: number
      deviceType?: DeviceType
      operatingSystem?: OperatingSystem
      browser?: Browser
    }

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('is_active')
      .eq('id', caller.id)
      .maybeSingle()

    if (callerProfileError) throw callerProfileError
    if (!callerProfile?.is_active) return json({ error: 'Konto jest nieaktywne.' }, 403)

    if (body.action === 'maintenance') {
      const { data, error } = await admin.rpc('run_daily_maintenance')
      if (error) throw error
      return json({ ok: true, maintenance: data })
    }

    const activityPayload: Record<string, unknown> = {
      user_id: caller.id,
      last_seen_at: new Date().toISOString(),
    }

    if (body.action === 'touch') {
      activityPayload.device_type = DEVICE_TYPES.has(body.deviceType || 'unknown') ? body.deviceType : 'unknown'
      activityPayload.operating_system = OPERATING_SYSTEMS.has(body.operatingSystem || 'unknown') ? body.operatingSystem : 'unknown'
      activityPayload.browser = BROWSERS.has(body.browser || 'unknown') ? body.browser : 'unknown'
    }

    const { error: activityError } = await admin
      .from('user_activity')
      .upsert(activityPayload, { onConflict: 'user_id' })

    if (activityError) throw activityError

    if (body.action === 'touch') {
      const { error: maintenanceError } = await admin.rpc('run_daily_maintenance')
      if (maintenanceError) console.warn('Daily maintenance failed:', maintenanceError)
      return json({ ok: true })
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
      const [{ data: profiles, error: profilesError }, { data: activity, error: listActivityError }, { data: admins, error: adminsError }] = await Promise.all([
        admin.from('profiles').select('id, player_code, display_name, avatar_path, is_active, colorblind_mode').order('display_name'),
        admin.from('user_activity').select('user_id, last_seen_at, device_type, operating_system, browser'),
        admin.from('admin_users').select('user_id'),
      ])

      if (profilesError) throw profilesError
      if (listActivityError) throw listActivityError
      if (adminsError) throw adminsError

      const activityByUser = new Map((activity || []).map((row) => [row.user_id, row]))
      const adminIds = new Set((admins || []).map((row) => row.user_id))

      const users = await Promise.all((profiles || []).map(async (profile) => {
        let avatarUrl: string | null = null
        if (profile.avatar_path) {
          const { data } = await admin.storage.from('avatars').createSignedUrl(profile.avatar_path, 60 * 60)
          avatarUrl = data?.signedUrl || null
        }

        const userActivity = activityByUser.get(profile.id)
        return {
          ...profile,
          avatar_url: avatarUrl,
          last_seen_at: userActivity?.last_seen_at || null,
          device_type: userActivity?.device_type || 'unknown',
          operating_system: userActivity?.operating_system || 'unknown',
          browser: userActivity?.browser || 'unknown',
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

    if (body.action === 'protected-days') {
      const { data, error } = await admin
        .from('calendar_day_protections')
        .select('day')
        .order('day')
      if (error) throw error
      return json({ days: (data || []).map((row) => row.day) })
    }

    if (body.action === 'set-day-protection') {
      if (!isDateKey(body.day) || typeof body.protected !== 'boolean') {
        return json({ error: 'Nieprawidłowy termin.' }, 400)
      }

      if (body.protected) {
        const { error } = await admin
          .from('calendar_day_protections')
          .upsert({ day: body.day, protected_by: caller.id }, { onConflict: 'day' })
        if (error) throw error
      } else {
        const { error } = await admin
          .from('calendar_day_protections')
          .delete()
          .eq('day', body.day)
        if (error) throw error
      }

      return json({ ok: true })
    }

    if (body.action === 'chat-cleanup-preview' || body.action === 'chat-cleanup') {
      const days = normalizeDays(body.days)
      if (!days) return json({ error: 'Podaj liczbę dni od 1 do 3650.' }, 400)

      const functionName = body.action === 'chat-cleanup-preview'
        ? 'count_chat_messages_older_than'
        : 'delete_chat_messages_older_than'
      const { data, error } = await admin.rpc(functionName, { p_days: days })
      if (error) throw error

      return body.action === 'chat-cleanup-preview'
        ? json({ count: Number(data || 0), days })
        : json({ deleted: Number(data || 0), days })
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

    if (body.action === 'set-colorblind') {
      if (!isUuid(body.userId) || typeof body.enabled !== 'boolean') {
        return json({ error: 'Nieprawidłowe dane trybu daltonisty.' }, 400)
      }

      const { error } = await admin
        .from('profiles')
        .update({ colorblind_mode: body.enabled })
        .eq('id', body.userId)
      if (error) throw error
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
