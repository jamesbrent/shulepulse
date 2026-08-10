// TODO: Add your Supabase credentials in .env tomorrow
// VITE_SUPABASE_URL=your_url
// VITE_SUPABASE_ANON_KEY=your_key

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oywptkvlztswblfchvyo.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95d3B0a3ZsenRzd2JsZmNodnlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjM4MTUsImV4cCI6MjA5NjUzOTgxNX0.Q_zNiV-U5UbbZ0sXw1C6pO3c6RX6-sCl-LoIvhxtuVc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)