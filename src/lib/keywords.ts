export interface Settings {
  keywords: string[];
  autoBlock: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  keywords: [],
  autoBlock: false
};

export function normalizeKeyword(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function parseKeywords(input: unknown): string[] {
  const parts = Array.isArray(input)
    ? input
    : String(input ?? "").split(/[\n,]+/);

  return [...new Set(parts.map(normalizeKeyword).filter(Boolean))];
}

export function compactKeywords(input: unknown): string[] {
  const keywords = parseKeywords(input);

  return keywords.filter((keyword) => !keywords.some((otherKeyword) =>
    otherKeyword !== keyword
    && otherKeyword.length < keyword.length
    && keyword.includes(otherKeyword)
  ));
}

export function mergeKeywords(existing: unknown, additions: unknown): string[] {
  return compactKeywords([...parseKeywords(existing), ...parseKeywords(additions)]);
}

export function normalizeSettings(raw: Partial<Settings> | Record<string, unknown> = {}): Settings {
  return {
    keywords: compactKeywords(raw.keywords ?? DEFAULT_SETTINGS.keywords),
    autoBlock: Boolean(raw.autoBlock)
  };
}

export function matchKeyword(text: unknown, keywords: string[]): string | null {
  const normalizedText = normalizeKeyword(text);
  if (!normalizedText) {
    return null;
  }

  return keywords.find((keyword) => normalizedText.includes(keyword)) ?? null;
}

export function summarizeKeywords(keywords: unknown): string {
  return compactKeywords(keywords).join(", ");
}
