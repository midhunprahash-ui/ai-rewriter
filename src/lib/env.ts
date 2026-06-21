export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function hasSupabaseConfig(): boolean {
  return getSupabaseConfig() !== null;
}

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export function getGeminiModelCandidates(): string[] {
  return uniqueStrings([
    getGeminiModel(),
    ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite")
      .split(",")
      .map((model) => model.trim()),
  ]);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
