import { describe, expect, test } from "vitest"
import {
  foldForMatch,
  likeContainsPattern,
  MATCH_SCORE,
  normalizeSearchQuery,
  phoneSearchFragment,
  rankSearchHits,
  SEARCH_MAX_TOKENS,
  SEARCH_QUERY_MAX_LENGTH,
  scoreSearchMatch,
  tokenizeSearchQuery,
} from "../matching"

describe("normalizeSearchQuery", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeSearchQuery("  Иван \t  Петров \n")).toBe("Иван Петров")
  })

  test("caps the length", () => {
    expect(normalizeSearchQuery("a".repeat(500))).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    )
  })
})

describe("tokenizeSearchQuery", () => {
  test("splits words, drops a leading @ and case-insensitive duplicates", () => {
    expect(tokenizeSearchQuery("@ivan Иван иван")).toEqual(["ivan", "Иван"])
  })

  test("returns no tokens for blank input", () => {
    expect(tokenizeSearchQuery("   ")).toEqual([])
    expect(tokenizeSearchQuery("@")).toEqual([])
  })

  test("keeps at most SEARCH_MAX_TOKENS tokens", () => {
    expect(tokenizeSearchQuery("a b c d e f g")).toHaveLength(SEARCH_MAX_TOKENS)
  })
})

describe("foldForMatch", () => {
  test("lower-cases Cyrillic and folds ё to е", () => {
    expect(foldForMatch("СЕМЁН Ёлкин")).toBe("семен елкин")
  })
})

describe("likeContainsPattern", () => {
  test("escapes LIKE wildcards in user input", () => {
    expect(likeContainsPattern("50%_off\\")).toBe(String.raw`%50\%\_off\\%`)
  })

  test("turns е/ё into a single-character wildcard", () => {
    expect(likeContainsPattern("Семён")).toBe("%С_м_н%")
  })
})

describe("phoneSearchFragment", () => {
  test("strips formatting from phone-like input", () => {
    expect(phoneSearchFragment("+7 (999) 123-45")).toBe("+799912345")
  })

  test("ignores names and too short numbers", () => {
    expect(phoneSearchFragment("Иван")).toBeNull()
    expect(phoneSearchFragment("12")).toBeNull()
  })
})

describe("scoreSearchMatch", () => {
  test("ranks exact < prefix < word prefix < contains < none", () => {
    expect(scoreSearchMatch("Продажи", "продажи")).toBe(MATCH_SCORE.exact)
    expect(scoreSearchMatch("Продажи курса", "прод")).toBe(MATCH_SCORE.prefix)
    expect(scoreSearchMatch("Воронка продаж", "прод")).toBe(
      MATCH_SCORE.wordPrefix,
    )
    expect(scoreSearchMatch("Распродажа", "прод")).toBe(MATCH_SCORE.allTokens)
    expect(scoreSearchMatch("Приветствие", "прод")).toBe(MATCH_SCORE.none)
  })

  test("matches multi-word queries in any order", () => {
    expect(scoreSearchMatch("Петров Иван", "иван пет")).toBe(
      MATCH_SCORE.wordPrefix,
    )
  })

  test("treats ё and е as the same letter", () => {
    expect(scoreSearchMatch("Семён", "семен")).toBe(MATCH_SCORE.exact)
  })

  test("returns none for empty labels", () => {
    expect(scoreSearchMatch(null, "a")).toBe(MATCH_SCORE.none)
    expect(scoreSearchMatch("", "a")).toBe(MATCH_SCORE.none)
  })
})

describe("rankSearchHits", () => {
  const byName = (hit: { name: string }) => [hit.name]

  test("orders by score, then shorter label, keeping database order on ties", () => {
    const hits = [
      { id: "1", name: "Распродажа" },
      { id: "2", name: "Продажи курса" },
      { id: "3", name: "Воронка продаж" },
      { id: "4", name: "Продажи" },
    ]
    expect(
      rankSearchHits(hits, "продажи", byName, 10).map((h) => h.id),
    ).toEqual(["4", "2"])
    expect(rankSearchHits(hits, "прод", byName, 10).map((h) => h.id)).toEqual([
      "4",
      "2",
      "3",
      "1",
    ])
  })

  test("drops wildcard false positives", () => {
    const hits = [
      { id: "1", name: "Семин" },
      { id: "2", name: "Семён" },
    ]
    expect(rankSearchHits(hits, "семен", byName, 10).map((h) => h.id)).toEqual([
      "2",
    ])
  })

  test("uses the best of several labels and respects the limit", () => {
    const hits = [
      { id: "1", name: "Анна", username: "zzz" },
      { id: "2", name: "Борис", username: "anna_shop" },
      { id: "3", name: "Анна Ли", username: null },
    ]
    const ranked = rankSearchHits(
      hits,
      "анна",
      (hit) => [hit.name, hit.username],
      2,
    )
    expect(ranked.map((h) => h.id)).toEqual(["1", "3"])
  })
})
