import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://oywptkvlztswblfchvyo.supabase.co'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: { school_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  const userClient = createClient(supabaseUrl, anonKey || supabaseKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const { data: callerProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'superadmin') {
    return json({ error: 'Superadmin only' }, 403)
  }

  if (typeof body.school_id !== 'string' || !body.school_id.trim()) {
    return json({ error: 'school_id is required and must be a string' }, 400)
  }
  const school_id = body.school_id.trim()

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .eq('id', school_id)
    .maybeSingle()

  if (schoolError) {
    return json({ error: 'Failed to look up school', details: schoolError.message }, 500)
  }

  if (!school) {
    return json({ error: 'School not found' }, 404)
  }

  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('school_id', school_id)
    .eq('role', 'admin')
    .limit(1)

  if (adminsError) {
    return json({ error: 'Failed to look up admins', details: adminsError.message }, 500)
  }

  const admin = admins?.[0]
  if (!admin?.email) {
    return json({ error: 'No admin found for this school' }, 404)
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: admin.email,
  })

  if (linkError || !linkData?.properties?.action_link) {
    return json({ error: 'Failed to generate link', details: linkError?.message ?? linkError }, 500)
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    school_id,
    action: 'admin.login_as',
    details: { adminEmail: admin.email, adminName: admin.full_name || admin.email },
  })

  if (auditError) {
    console.error('Failed to record audit log:', auditError.message)
  }

  return json({
    url: linkData.properties.action_link,
    school: school.name,
    admin: admin.full_name || admin.email,
  })
})
