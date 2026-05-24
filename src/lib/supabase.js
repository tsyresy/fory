import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://zbutquzauitayuvepgdk.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpidXRxdXphdWl0YXl1dmVwZ2RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjc5NjgsImV4cCI6MjA5NDEwMzk2OH0.YJLLz6g_dCRlE4CLjXINbgziSfJpk3SdQ4FVgu6kI-k";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
