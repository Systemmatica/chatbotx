/**
 * Pure query normalization and ranking for the workspace quick search. The
 * database narrows candidates with case-insensitive `ILIKE` (every token must
 * match); the final order is decided here so it can be unit tested and stays
 * identical for every result type.
 */

export const SEARCH_QUERY_MAX_LENGTH = 100
export const SEARCH_MAX_TOKENS = 5

const WHITESPACE_REGEX = /\s+/g
const PHONE_CHARS_REGEX = /^\+?[\d\s\-()]+$/
const PHONE_FORMATTING_REGEX = /[\s\-()]/g
const NON_DIGIT_REGEX = /\D/g
const MIN_PHONE_DIGITS = 3
const LEADING_AT_REGEX = /^@+/

/** Trims, collapses inner whitespace and caps the length of a raw query. */
export const normalizeSearchQuery = (raw: string): string =>
  raw
    .replace(WHITESPACE_REGEX, " ")
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH)
    .trim()

/**
 * Lower-cases and folds `ё` to `е`, so "Семён" and "семен" compare equal when
 * ranking (Russian users type both spellings interchangeably).
 */
export const foldForMatch = (value: string): string =>
  value.toLocaleLowerCase("ru").replaceAll("ё", "е")

/**
 * Splits a normalized query into unique search tokens. A leading `@` is
 * dropped so "@ivan" finds the channel username "ivan".
 */
export const tokenizeSearchQuery = (query: string): string[] => {
  const tokens: string[] = []
  for (const part of normalizeSearchQuery(query).split(" ")) {
    const token = part.replace(LEADING_AT_REGEX, "")
    if (token && !tokens.some((t) => foldForMatch(t) === foldForMatch(token))) {
      tokens.push(token)
    }
    if (tokens.length >= SEARCH_MAX_TOKENS) {
      break
    }
  }
  return tokens
}

/**
 * Returns the phone fragment to search for when the query looks like a phone
 * number ("+7 (999) 12" -> "+799912"), otherwise null.
 */
export const phoneSearchFragment = (query: string): string | null => {
  const trimmed = query.trim()
  if (!PHONE_CHARS_REGEX.test(trimmed)) {
    return null
  }
  if (trimmed.replace(NON_DIGIT_REGEX, "").length < MIN_PHONE_DIGITS) {
    return null
  }
  return trimmed.replace(PHONE_FORMATTING_REGEX, "")
}

const LIKE_SPECIAL_REGEX = /[\\%_]/g
const YO_REGEX = /[ЕЁеё]/g

/**
 * Builds an `ILIKE '%...%'` pattern for one token. LIKE wildcards in user input
 * are escaped, and every `е`/`ё` becomes a single-character wildcard so both
 * spellings are found; `rankSearchHits` then drops the rare false positives.
 */
export const likeContainsPattern = (token: string): string =>
  `%${token.replace(LIKE_SPECIAL_REGEX, "\\$&").replace(YO_REGEX, "_")}%`

/** Lower score = better match. */
export const MATCH_SCORE = {
  exact: 0,
  prefix: 1,
  wordPrefix: 2,
  allTokens: 3,
  none: 4,
} as const

const WORD_SPLIT_REGEX = /[\s\-_.,:;/()«»"'@]+/

/** Scores how well one label matches the query (see `MATCH_SCORE`). */
export const scoreSearchMatch = (
  label: string | null | undefined,
  query: string,
): number => {
  if (!label) {
    return MATCH_SCORE.none
  }
  const text = foldForMatch(normalizeSearchQuery(label))
  const needle = foldForMatch(
    normalizeSearchQuery(query).replace(LEADING_AT_REGEX, ""),
  )
  if (!needle) {
    return MATCH_SCORE.none
  }
  if (text === needle) {
    return MATCH_SCORE.exact
  }
  if (text.startsWith(needle)) {
    return MATCH_SCORE.prefix
  }

  const words = text.split(WORD_SPLIT_REGEX).filter(Boolean)
  const tokens = tokenizeSearchQuery(needle)
  if (
    tokens.length > 0 &&
    tokens.every((token) => words.some((word) => word.startsWith(token)))
  ) {
    return MATCH_SCORE.wordPrefix
  }
  if (tokens.length > 0 && tokens.every((token) => text.includes(token))) {
    return MATCH_SCORE.allTokens
  }
  return MATCH_SCORE.none
}

/**
 * Orders hits by their best-scoring label, then by the primary label length
 * (a shorter name is a closer match), then alphabetically, and keeps `limit`.
 * Ties keep the database order (most recent first). Hits none of whose labels
 * contain every token are dropped (wildcard false positives such as "семин"
 * for "семен").
 */
export const rankSearchHits = <T>(
  hits: readonly T[],
  query: string,
  getLabels: (hit: T) => ReadonlyArray<string | null | undefined>,
  limit: number,
): T[] =>
  hits
    .map((hit, index) => {
      const labels = getLabels(hit)
      const primary = labels.find((label) => Boolean(label)) ?? ""
      const score = Math.min(
        MATCH_SCORE.none,
        ...labels.map((label) => scoreSearchMatch(label, query)),
      )
      return { hit, index, score, primary: foldForMatch(primary) }
    })
    .filter(({ score }) => score < MATCH_SCORE.none)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.primary.length - b.primary.length ||
        a.primary.localeCompare(b.primary, "ru") ||
        a.index - b.index,
    )
    .slice(0, Math.max(0, limit))
    .map(({ hit }) => hit)
