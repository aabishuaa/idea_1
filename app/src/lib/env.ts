/**
 * Client environment (EXPO_PUBLIC_* only — anything here ships in the bundle,
 * so the anon key is the ONLY Supabase key allowed; see SR-13 / SETUP.md §7).
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.includes('REPLACE_ME')) {
    // Fail loudly at startup rather than mysteriously at first request.
    console.warn(
      `[myB] Missing env var ${name}. Copy app/.env.example to app/.env and fill it in (SETUP.md §3).`,
    );
    return value ?? '';
  }
  return value;
}

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  aiServiceUrl: required(
    'EXPO_PUBLIC_AI_SERVICE_URL',
    process.env.EXPO_PUBLIC_AI_SERVICE_URL,
  ).replace(/\/$/, ''),
};
