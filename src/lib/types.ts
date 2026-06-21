export const HUMANIZE_MODES = [
  "professional_report",
  "audit_observation",
  "management_comment",
  "tax_compliance",
  "client_explanation",
] as const;

export const HUMANIZE_STRENGTHS = ["light", "medium", "strong"] as const;
export const LENGTH_MODES = ["preserve", "shorter", "longer"] as const;

export type HumanizeMode = (typeof HUMANIZE_MODES)[number];
export type HumanizeStrength = (typeof HUMANIZE_STRENGTHS)[number];
export type LengthMode = (typeof LENGTH_MODES)[number];

export type HumanizeRequest = {
  text: string;
  mode: HumanizeMode;
  strength: HumanizeStrength;
  lengthMode: LengthMode;
};

export type HumanizeScores = {
  clarity: number;
  formality: number;
  preservation: number;
};

export type HumanizeResult = {
  output: string;
  changeSummary: string;
  warnings: string[];
  preservedItems: string[];
  scores: HumanizeScores;
};

export type HumanizeApiResponse = HumanizeResult & {
  humanizationId: string | null;
  createdAt: string;
};

export type HumanizeHistoryItem = {
  id: string;
  originalText: string;
  humanizedText: string;
  mode: HumanizeMode;
  strength: HumanizeStrength;
  lengthMode: LengthMode;
  warnings: string[];
  createdAt: string;
};

export const MODE_LABELS: Record<HumanizeMode, string> = {
  professional_report: "Professional report",
  audit_observation: "Audit observation",
  management_comment: "Management comment",
  tax_compliance: "Tax/compliance",
  client_explanation: "Client explanation",
};

export const STRENGTH_LABELS: Record<HumanizeStrength, string> = {
  light: "Light",
  medium: "Natural",
  strong: "Polished",
};

export const LENGTH_LABELS: Record<LengthMode, string> = {
  preserve: "Preserve",
  shorter: "Shorter",
  longer: "Longer",
};
