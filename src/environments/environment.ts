export const environment = {
  production: false,
  // Base URL for your own backend API. All ApiClient calls are prefixed with this.
  apiUrl: 'http://localhost:8080/api',
  // Supabase project credentials (Auth only). Replace with your project's values.
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY',
} as const;
