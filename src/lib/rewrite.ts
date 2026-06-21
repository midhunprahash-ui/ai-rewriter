import { GoogleGenAI } from "@google/genai";
import {
  LENGTH_MODES,
  REWRITE_MODES,
  REWRITE_STRENGTHS,
  type LengthMode,
  type RewriteMode,
  type RewriteRequest,
  type RewriteResult,
  type RewriteScores,
  type RewriteStrength,
} from "@/lib/types";
import { getGeminiApiKey, getGeminiModelCandidates } from "@/lib/env";

const MAX_INPUT_CHARS = 12_000;

const SYSTEM_INSTRUCTION = [
  "You are a senior drafting assistant for an Indian Chartered Accountant.",
  "Rewrite text for professional reports using formal legal-style Indian English.",
  "Preserve the user's meaning and all facts exactly.",
  "Do not invent statutory references, legal conclusions, audit evidence, compliance status, figures, dates, parties, or document references.",
  "Preserve amounts, percentages, dates, FY/AY references, section/rule references, names, PAN/GSTIN-like identifiers, invoice numbers, document references, assumptions, caveats, and limitations.",
  "If the source is ambiguous or insufficient, include a warning instead of silently filling the gap.",
  "Never make claims about bypassing AI detection.",
  "Return only valid JSON matching the requested shape.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "output",
    "changeSummary",
    "warnings",
    "preservedItems",
    "scores",
  ],
  properties: {
    output: { type: "string" },
    changeSummary: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    preservedItems: {
      type: "array",
      items: { type: "string" },
    },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["clarity", "formality", "preservation"],
      properties: {
        clarity: { type: "number", minimum: 0, maximum: 100 },
        formality: { type: "number", minimum: 0, maximum: 100 },
        preservation: { type: "number", minimum: 0, maximum: 100 },
      },
    },
  },
};

export function normalizeRewriteRequest(input: unknown): RewriteRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid request body.");
  }

  const record = input as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const mode = normalizeOption(
    record.mode,
    REWRITE_MODES,
    "professional_report",
  );
  const strength = normalizeOption(record.strength, REWRITE_STRENGTHS, "medium");
  const lengthMode = normalizeOption(record.lengthMode, LENGTH_MODES, "preserve");

  if (text.length < 20) {
    throw new Error("Please enter at least 20 characters to rewrite.");
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`Please keep the input under ${MAX_INPUT_CHARS} characters.`);
  }

  if (containsDetectorBypassIntent(text)) {
    throw new Error(
      "This tool does not support AI-detector bypass requests. Use it for professional rewriting and review.",
    );
  }

  return { text, mode, strength, lengthMode };
}

export async function generateProfessionalRewrite(
  request: RewriteRequest,
): Promise<RewriteResult> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error("Gemini is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const criticalItems = extractCriticalItems(request.text);
  const response = await generateContentWithFallback(ai, {
    models: getGeminiModelCandidates(),
    contents: buildPrompt(request, criticalItems),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.25,
      topP: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  });

  const raw = response.text ?? "";
  const result = parseRewriteResult(raw);
  const preservationWarnings = findMissingCriticalItems(
    criticalItems,
    result.output,
  );

  return {
    ...result,
    warnings: uniqueStrings([...result.warnings, ...preservationWarnings]),
    preservedItems: uniqueStrings([...criticalItems, ...result.preservedItems]),
  };
}

type GeminiGenerateParams = {
  models: string[];
  contents: string;
  config: {
    systemInstruction: string;
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    responseMimeType: string;
    responseJsonSchema: typeof RESPONSE_SCHEMA;
  };
};

async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: GeminiGenerateParams,
) {
  const errors: string[] = [];

  for (const model of params.models) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
      } catch (error) {
        errors.push(`${model}: ${getGeminiErrorMessage(error)}`);

        if (!isRetryableGeminiError(error)) {
          throw error;
        }

        if (attempt < 2) {
          await sleep(600 * attempt);
        }
      }
    }
  }

  throw new Error(
    `Gemini is temporarily unavailable. Tried ${params.models.join(", ")}. ${
      errors[errors.length - 1] || "Please try again later."
    }`,
  );
}

function isRetryableGeminiError(error: unknown): boolean {
  const statusCode = getErrorStatusCode(error);
  const message = getGeminiErrorMessage(error).toLowerCase();

  return (
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("rate limit")
  );
}

function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as Record<string, unknown>;
  const status = record.status ?? record.code;

  if (typeof status === "number") {
    return status;
  }

  if (typeof status === "string") {
    const parsed = Number.parseInt(status, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function getGeminiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function extractCriticalItems(text: string): string[] {
  const patterns: RegExp[] = [
    /\b(?:INR|Rs\.?)\s*[\d,]+(?:\.\d+)?\b/gi,
    /\b\d+(?:\.\d+)?\s*%\b/g,
    /\b(?:FY|F\.Y\.|AY|A\.Y\.)\s*\d{4}\s*[-/]\s*\d{2,4}\b/gi,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    /\b\d{1,2}\s+(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{4}\b/gi,
    /\b(?:section|sec\.|rule)\s+[0-9A-Za-z()/-]+(?:\s+of\s+the\s+[A-Za-z ]+)?/gi,
    /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g,
    /\b(?:invoice|bill|challan|notice|document|working paper)\s*(?:no\.?|number|#)?\s*[:/-]?\s*[A-Z0-9/-]+\b/gi,
  ];

  return uniqueStrings(
    patterns.flatMap((pattern) => text.match(pattern) ?? []).map((item) =>
      item.replace(/\s+/g, " ").trim(),
    ),
  );
}

function buildPrompt(request: RewriteRequest, criticalItems: string[]): string {
  return [
    "Rewrite the following text.",
    `Mode: ${describeMode(request.mode)}.`,
    `Rewrite strength: ${describeStrength(request.strength)}.`,
    `Length instruction: ${describeLength(request.lengthMode)}.`,
    "Jurisdiction context: India.",
    "Required JSON keys: output, changeSummary, warnings, preservedItems, scores.",
    "Scores must be numbers from 0 to 100 for clarity, formality, and preservation.",
    criticalItems.length > 0
      ? `Critical items to preserve exactly: ${criticalItems.join("; ")}.`
      : "No critical financial/legal tokens were automatically detected; still preserve all facts.",
    "Source text:",
    request.text,
  ].join("\n\n");
}

function describeMode(mode: RewriteMode): string {
  const descriptions: Record<RewriteMode, string> = {
    professional_report:
      "formal professional report paragraph suitable for Indian CA deliverables",
    audit_observation:
      "precise audit observation, non-accusatory, evidence-aware, and caveated",
    management_comment:
      "formal management comment with clear issue, implication, and corrective framing",
    tax_compliance:
      "conservative tax or compliance paragraph without adding legal positions",
    client_explanation:
      "clear client-facing explanation in professional Indian English",
  };

  return descriptions[mode];
}

function describeStrength(strength: RewriteStrength): string {
  const descriptions: Record<RewriteStrength, string> = {
    light: "minimal edits; retain most wording and structure",
    medium: "improve flow, precision, and professional tone while preserving structure",
    strong: "substantial rewrite for clarity and report-readiness without changing facts",
  };

  return descriptions[strength];
}

function describeLength(lengthMode: LengthMode): string {
  const descriptions: Record<LengthMode, string> = {
    preserve: "keep approximately the same length",
    shorter: "make it more concise without removing necessary caveats",
    longer: "expand only for clarity; do not add unsupported facts",
  };

  return descriptions[lengthMode];
}

function normalizeOption<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : fallback;
}

function containsDetectorBypassIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "undetectable ai",
    "bypass ai detector",
    "bypass ai detection",
    "avoid ai detection",
    "pass ai detector",
    "stealth writer",
    "stealthwriter",
  ].some((phrase) => normalized.includes(phrase));
}

function parseRewriteResult(raw: string): RewriteResult {
  const parsed = parseModelJson(raw);

  if (parsed !== null) {
    return coerceRewriteResult(parsed);
  }

  const output = stripMarkdownFence(raw).trim();

  if (!output) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    output,
    changeSummary:
      "Gemini returned an unstructured response, so it was used as the rewrite output.",
    warnings: [
      "Review required: Gemini did not return structured JSON for this rewrite.",
    ],
    preservedItems: [],
    scores: {
      clarity: 70,
      formality: 70,
      preservation: 60,
    },
  };
}

function parseModelJson(raw: string): unknown | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const withoutFence = stripMarkdownFence(trimmed);

    if (withoutFence !== trimmed) {
      try {
        return JSON.parse(withoutFence);
      } catch {
        // Continue to balanced object extraction below.
      }
    }

    const objectText = extractFirstJsonObject(withoutFence);

    if (!objectText) {
      return null;
    }

    try {
      return JSON.parse(objectText);
    } catch {
      return null;
    }
  }
}

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function coerceRewriteResult(value: unknown): RewriteResult {
  if (!value || typeof value !== "object") {
    throw new Error("Gemini returned an invalid rewrite payload.");
  }

  const record = value as Record<string, unknown>;
  const output = asString(record.output);

  if (!output) {
    throw new Error("Gemini returned an empty rewrite.");
  }

  return {
    output,
    changeSummary:
      asString(record.changeSummary) ||
      "Rewritten for formal CA report clarity and tone.",
    warnings: asStringArray(record.warnings),
    preservedItems: asStringArray(record.preservedItems),
    scores: coerceScores(record.scores),
  };
}

function coerceScores(value: unknown): RewriteScores {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    clarity: clampScore(record.clarity, 80),
    formality: clampScore(record.formality, 85),
    preservation: clampScore(record.preservation, 80),
  };
}

function findMissingCriticalItems(items: string[], output: string): string[] {
  const normalizedOutput = output.toLowerCase();

  return items
    .filter((item) => !normalizedOutput.includes(item.toLowerCase()))
    .map((item) => `Review required: critical item may not be preserved exactly: ${item}`);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(value.filter((item): item is string => typeof item === "string"))
    : [];
}

function clampScore(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}
