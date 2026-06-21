import { GoogleGenAI } from "@google/genai";
import {
  HUMANIZE_MODES,
  HUMANIZE_STRENGTHS,
  LENGTH_MODES,
  type HumanizeMode,
  type HumanizeRequest,
  type HumanizeResult,
  type HumanizeScores,
  type HumanizeStrength,
  type LengthMode,
} from "@/lib/types";
import { getGeminiApiKey, getGeminiModelCandidates } from "@/lib/env";

const MAX_INPUT_CHARS = 12_000;

const SYSTEM_INSTRUCTION = [
  "You are a senior drafting assistant for an Indian Chartered Accountant.",
  "Humanize professional text so it reads like a careful Indian CA drafted it, not like a generic AI template.",
  "Make the wording natural, measured, specific, and professionally human while preserving Indian business English.",
  "Keep some of the source writer's texture where it is acceptable; do not over-smooth every sentence.",
  "Vary sentence rhythm and paragraph shape, but do not use casual slang, filler, personal anecdotes, jokes, or marketing language.",
  "Avoid generic AI-style connectors and filler such as moreover, furthermore, in conclusion, it is important to note, it is pertinent to mention, comprehensive, robust, seamless, leverage, and underscores.",
  "Preserve the user's meaning and all facts exactly.",
  "Do not invent statutory references, legal conclusions, audit evidence, compliance status, figures, dates, parties, or document references.",
  "Preserve amounts, percentages, dates, FY/AY references, section/rule references, names, PAN/GSTIN-like identifiers, invoice numbers, document references, assumptions, caveats, and limitations.",
  "If the source is ambiguous or insufficient, include a warning instead of silently filling the gap.",
  "Do not make claims about AI detection, detector scores, plagiarism, originality, or bypassing detectors.",
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

const HUMAN_STYLE_GUIDELINES = [
  "Prefer plain, precise words over grand or abstract wording.",
  "Use contractions only if the selected mode is client-facing and the source tone allows it; otherwise stay professional.",
  "Use a mix of short and medium sentences instead of evenly balanced long sentences.",
  "Do not start every paragraph with a formal transition.",
  "Do not add a polished summary sentence unless the source already implies one.",
  "Keep caveats and limitations close to the relevant facts instead of moving them into generic closing language.",
  "For Indian CA work, use natural phrases like based on our review, we noted, the records indicate, or management has represented only where supported by the source.",
  "If a sentence is already human and serviceable, keep it close to the original instead of replacing it with a template.",
];

export function normalizeHumanizeRequest(input: unknown): HumanizeRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid request body.");
  }

  const record = input as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const mode = normalizeOption(
    record.mode,
    HUMANIZE_MODES,
    "professional_report",
  );
  const strength = normalizeOption(
    record.strength,
    HUMANIZE_STRENGTHS,
    "medium",
  );
  const lengthMode = normalizeOption(record.lengthMode, LENGTH_MODES, "preserve");

  if (text.length < 20) {
    throw new Error("Please enter at least 20 characters to humanize.");
  }

  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(
      `Please keep the input under ${MAX_INPUT_CHARS} characters.`,
    );
  }

  if (containsDetectorBypassIntent(text)) {
    throw new Error(
      "This tool does not support AI-detector bypass requests. Use it to humanize professional wording and review.",
    );
  }

  return { text, mode, strength, lengthMode };
}

export async function generateHumanizedText(
  request: HumanizeRequest,
): Promise<HumanizeResult> {
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
      temperature: getTemperature(request.strength),
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  });

  const raw = response.text ?? "";
  const result = parseHumanizeResult(raw);
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

function buildPrompt(request: HumanizeRequest, criticalItems: string[]): string {
  return [
    "Humanize the following text.",
    `Humanization mode: ${describeMode(request.mode)}.`,
    `Humanization strength: ${describeStrength(request.strength)}.`,
    `Length instruction: ${describeLength(request.lengthMode)}.`,
    "Jurisdiction context: India.",
    "Required JSON keys: output, changeSummary, warnings, preservedItems, scores.",
    "Scores must be numbers from 0 to 100 for clarity, formality, and preservation.",
    "Humanized output should feel natural and professionally drafted while avoiding casual language and unsupported additions.",
    "Do not claim or imply that the output will pass AI detectors.",
    "Natural style guidelines:",
    HUMAN_STYLE_GUIDELINES.map((item) => `- ${item}`).join("\n"),
    criticalItems.length > 0
      ? `Critical items to preserve exactly: ${criticalItems.join("; ")}.`
      : "No critical financial/legal tokens were automatically detected; still preserve all facts.",
    "Source text:",
    request.text,
  ].join("\n\n");
}

function describeMode(mode: HumanizeMode): string {
  const descriptions: Record<HumanizeMode, string> = {
    professional_report:
      "natural professional report paragraph suitable for Indian CA deliverables",
    audit_observation:
      "human, precise audit observation that is non-accusatory, evidence-aware, and caveated",
    management_comment:
      "natural management comment with clear issue, implication, and corrective framing",
    tax_compliance:
      "conservative tax or compliance paragraph without adding legal positions",
    client_explanation:
      "clear client-facing explanation in natural professional Indian English",
  };

  return descriptions[mode];
}

function describeStrength(strength: HumanizeStrength): string {
  const descriptions: Record<HumanizeStrength, string> = {
    light:
      "light humanization; retain most wording while reducing robotic phrasing",
    medium:
      "balanced humanization; improve flow and sentence rhythm without making the text sound overly polished",
    strong:
      "more natural humanization; remove template-like phrasing and vary expression without changing facts",
  };

  return descriptions[strength];
}

function getTemperature(strength: HumanizeStrength): number {
  const temperatures: Record<HumanizeStrength, number> = {
    light: 0.35,
    medium: 0.55,
    strong: 0.65,
  };

  return temperatures[strength];
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

function parseHumanizeResult(raw: string): HumanizeResult {
  const parsed = parseModelJson(raw);

  if (parsed !== null) {
    return coerceHumanizeResult(parsed);
  }

  const output = stripMarkdownFence(raw).trim();

  if (!output) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    output,
    changeSummary:
      "Gemini returned an unstructured response, so it was used as the humanized output.",
    warnings: [
      "Review required: Gemini did not return structured JSON for this humanization.",
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

function coerceHumanizeResult(value: unknown): HumanizeResult {
  if (!value || typeof value !== "object") {
    throw new Error("Gemini returned an invalid humanization payload.");
  }

  const record = value as Record<string, unknown>;
  const output = asString(record.output);

  if (!output) {
    throw new Error("Gemini returned an empty humanized output.");
  }

  return {
    output,
    changeSummary:
      asString(record.changeSummary) ||
      "Humanized for natural CA report clarity and tone.",
    warnings: asStringArray(record.warnings),
    preservedItems: asStringArray(record.preservedItems),
    scores: coerceScores(record.scores),
  };
}

function coerceScores(value: unknown): HumanizeScores {
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
    .map(
      (item) =>
        `Review required: critical item may not be preserved exactly: ${item}`,
    );
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
    ? uniqueStrings(
        value.filter((item): item is string => typeof item === "string"),
      )
    : [];
}

function clampScore(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}
