import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gsmrccofuegcmujycydd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbXJjY29mdWVnY211anljeWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjUzMjUsImV4cCI6MjA4OTAwMTMyNX0.h6gzT3p5L1jSlsJuaf7MNV6L3t1Hjq2saHA78HNbUcg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
