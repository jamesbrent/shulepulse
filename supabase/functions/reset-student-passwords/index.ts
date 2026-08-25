import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN')
if (!ALLOWED_ORIGIN) throw new Error('APP_ORIGIN env var is required')

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically secure random password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => chars[byte % chars.length]).join('')
}

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    if (!anonKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // Get caller profile with school_id and role
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['admin', 'superadmin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Get the caller's school_id (must be set for non-superadmins)
    const callerSchoolId = callerProfile.school_id
    if (!callerSchoolId && callerProfile.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'School admin must have a school' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const body = await req.json().catch(() => ({}))
    
    // SECURITY: Always generate unique passwords per student
    // Ignore any client-provided password to prevent shared password vulnerability
    const generateUniquePasswords = body.generate_unique !== false // Default to true

    // First, get students belonging to THIS school only
    const { data: schoolStudents, error: studentsError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('school_id', callerSchoolId)
      .eq('role', 'student')
      .eq('is_active', true)

    if (studentsError) {
      return new Response(JSON.stringify({ error: studentsError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!schoolStudents || schoolStudents.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        reset: 0,
        failed: 0,
        total: 0,
        errors: [],
        message: 'No active students found in this school',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    let reset = 0
    let failed = 0
    const errors = []
    const results: { email: string; temp_password: string }[] = []

    for (const student of schoolStudents) {
      // Generate unique password for each student
      const newPassword = generateSecurePassword()

      const { error } = await supabase.auth.admin.updateUserById(student.id, {
        password: newPassword,
      })
      
      if (error) {
        failed++
        errors.push({ email: student.email, error: error.message })
      } else {
        reset++
        results.push({ email: student.email, temp_password: newPassword })
      }
    }

    // Log the reset action for audit trail
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      school_id: callerSchoolId,
      action: 'password_reset',
      entity_type: 'student',
      entity_id: null,
      old_value: null,
      new_value: JSON.stringify({
        reset_count: reset,
        failed_count: failed,
        total_students: schoolStudents.length,
      }),
    })

    return new Response(JSON.stringify({
      success: true,
      reset,
      failed,
      total: schoolStudents.length,
      errors,
      // SECURITY: Only return temp passwords for successful resets
      // Client should display these to admin for distribution
      temp_passwords: results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
