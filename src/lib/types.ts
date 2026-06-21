export const REWRITE_MODES = [
  "professional_report",
  "audit_observation",
  "management_comment",
  "tax_compliance",
  "client_explanation",
] as const;

export const REWRITE_STRENGTHS = ["light", "medium", "strong"] as const;
export const LENGTH_MODES = ["preserve", "shorter", "longer"] as const;

export type RewriteMode = (typeof REWRITE_MODES)[number];
export type RewriteStrength = (typeof REWRITE_STRENGTHS)[number];
export type LengthMode = (typeof LENGTH_MODES)[number];

export type RewriteRequest = {
  text: string;
  mode: RewriteMode;
  strength: RewriteStrength;
  lengthMode: LengthMode;
};

export type RewriteScores = {
  clarity: number;
  formality: number;
  preservation: number;
};

export type RewriteResult = {
  output: string;
  changeSummary: string;
  warnings: string[];
  preservedItems: string[];
  scores: RewriteScores;
};

export type RewriteApiResponse = RewriteResult & {
  rewriteId: string | null;
  createdAt: string;
};

export type RewriteHistoryItem = {
  id: string;
  originalText: string;
  rewrittenText: string;
  mode: RewriteMode;
  strength: RewriteStrength;
  lengthMode: LengthMode;
  warnings: string[];
  createdAt: string;
};

export const MODE_LABELS: Record<RewriteMode, string> = {
  professional_report: "Professional report",
  audit_observation: "Audit observation",
  management_comment: "Management comment",
  tax_compliance: "Tax/compliance",
  client_explanation: "Client explanation",
};

export const STRENGTH_LABELS: Record<RewriteStrength, string> = {
  light: "Light",
  medium: "Medium",
  strong: "Strong",
};

export const LENGTH_LABELS: Record<LengthMode, string> = {
  preserve: "Preserve",
  shorter: "Shorter",
  longer: "Longer",
};
