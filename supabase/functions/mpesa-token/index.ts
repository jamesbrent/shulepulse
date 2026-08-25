import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN')
if (!ALLOWED_ORIGIN) throw new Error('APP_ORIGIN env var is required')
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const origin = req.headers.get('Origin')
  if (origin !== ALLOWED_ORIGIN) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Verify user has a finance role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    const FINANCE_ROLES = ['admin', 'deputy_administrator', 'bursar', 'treasurer', 'superadmin']
    if (!profile || !FINANCE_ROLES.includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Fetch M-Pesa credentials from platform_settings (superadmin-only table)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: settings } = await adminClient
      .from('platform_settings')
      .select('payment_gateways')
      .eq('id', 1)
      .single()

    const pg = settings?.payment_gateways || {}
    const consumerKey = pg.mpesa_consumer_key
    const consumerSecret = pg.mpesa_consumer_secret

    if (!consumerKey || !consumerSecret) {
      return new Response(JSON.stringify({ error: 'M-Pesa credentials not configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Get OAuth token from Safaricom
    const credentials = btoa(`${consumerKey}:${consumerSecret}`)
    const tokenRes = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${credentials}` },
    })

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to obtain M-Pesa token' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { access_token, expires_in } = await tokenRes.json()

    return new Response(JSON.stringify({ access_token, expires_in }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('[mpesa-token] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
