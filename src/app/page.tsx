import { AuthPanel } from "@/components/AuthPanel";
import { RewriterWorkspace } from "@/components/RewriterWorkspace";
import { hasSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LengthMode,
  RewriteHistoryItem,
  RewriteMode,
  RewriteStrength,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasSupabaseConfig()) {
    return <SetupNotice />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AuthPanel />;
  }

  const { data } = await supabase
    .from("rewrites")
    .select(
      "id, original_text, rewritten_text, mode, strength, length_mode, warnings, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <RewriterWorkspace
      userEmail={user.email ?? "Signed in"}
      initialHistory={(data ?? []).map(toHistoryItem)}
    />
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5">
      <div className="space-y-4 rounded-md border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-emerald-700">AI Rewriter</p>
        <h1 className="text-2xl font-semibold text-zinc-950">
          Configure Supabase to start
        </h1>
        <p className="text-sm leading-6 text-zinc-600">
          Add the Supabase URL and anon key in `.env.local`, then restart the
          dev server. Gemini is also required before rewriting will work.
        </p>
        <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
          NEXT_PUBLIC_SUPABASE_URL=...
          {"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=...
          {"\n"}GEMINI_API_KEY=...
        </pre>
      </div>
    </main>
  );
}

function toHistoryItem(row: Record<string, unknown>): RewriteHistoryItem {
  return {
    id: String(row.id),
    originalText: String(row.original_text ?? ""),
    rewrittenText: String(row.rewritten_text ?? ""),
    mode: normalizeValue(row.mode, "professional_report") as RewriteMode,
    strength: normalizeValue(row.strength, "medium") as RewriteStrength,
    lengthMode: normalizeValue(row.length_mode, "preserve") as LengthMode,
    warnings: Array.isArray(row.warnings)
      ? row.warnings.filter((item): item is string => typeof item === "string")
      : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function normalizeValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
