import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseConfig } from "@/lib/env";
import {
  generateProfessionalRewrite,
  normalizeRewriteRequest,
} from "@/lib/rewrite";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rewriteRequest;

  try {
    rewriteRequest = normalizeRewriteRequest(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Invalid rewrite request.") },
      { status: 400 },
    );
  }

  try {
    await ensureProfile(user, supabase);

    const quota = await getMonthlyQuota(user.id, supabase);
    const usageCount = await getMonthlyRewriteCount(user.id, supabase);

    if (usageCount >= quota) {
      return NextResponse.json(
        { error: "Monthly rewrite quota reached." },
        { status: 429 },
      );
    }

    const result = await generateProfessionalRewrite(rewriteRequest);
    const now = new Date().toISOString();
    const saveResult = await supabase
      .from("rewrites")
      .insert({
        user_id: user.id,
        original_text: rewriteRequest.text,
        rewritten_text: result.output,
        mode: rewriteRequest.mode,
        strength: rewriteRequest.strength,
        length_mode: rewriteRequest.lengthMode,
        warnings: result.warnings,
        preserved_items: result.preservedItems,
        scores: result.scores,
      })
      .select("id, created_at")
      .single();

    const usageResult = await supabase.from("usage_events").insert({
      user_id: user.id,
      event_type: "rewrite",
      input_chars: rewriteRequest.text.length,
      output_chars: result.output.length,
    });

    const warnings = [...result.warnings];

    if (saveResult.error) {
      warnings.push("Rewrite completed, but it could not be saved to history.");
    }

    if (usageResult.error) {
      warnings.push("Rewrite completed, but usage tracking could not be saved.");
    }

    return NextResponse.json({
      rewriteId: saveResult.data?.id ?? null,
      createdAt: saveResult.data?.created_at ?? now,
      ...result,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to rewrite this text.") },
      { status: getRewriteErrorStatus(error) },
    );
  }
}

async function ensureProfile(
  user: User,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to read the user profile.");
  }

  if (data) {
    return;
  }

  const insertResult = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
  });

  if (insertResult.error) {
    throw new Error("Unable to create the user profile.");
  }
}

async function getMonthlyQuota(
  userId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .select("monthly_quota")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to read the monthly quota.");
  }

  return typeof data?.monthly_quota === "number" ? data.monthly_quota : 100;
}

async function getMonthlyRewriteCount(
  userId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<number> {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "rewrite")
    .gte("created_at", periodStart.toISOString());

  if (error) {
    throw new Error("Unable to read monthly usage.");
  }

  return count ?? 0;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getRewriteErrorStatus(error: unknown): number {
  const message = getErrorMessage(error, "").toLowerCase();

  if (
    message.includes("temporarily unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("rate limit")
  ) {
    return 503;
  }

  return 500;
}
