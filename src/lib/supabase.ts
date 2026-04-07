import { createClient } from '@supabase/supabase-js';

// Use static strings for Vite environment variables to ensure correct replacement
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = (envUrl && envUrl.startsWith('http')) ? envUrl : 'https://brtqdokwotdrwtxepozk.supabase.co';
const supabaseAnonKey = envKey || 'sb_publishable_mCZTr2JMIeyn3zhSvsfahg_RL36fWwa';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
