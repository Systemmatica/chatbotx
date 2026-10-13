import { describe, expect, test } from "vitest"
import {
  extractMentionedUserIds,
  findMentionQuery,
  formatMention,
  insertMention,
  mentionsToPlainText,
  newlyMentionedUserIds,
  parseMentionSegments,
  sanitizeMentionName,
} from "../src/mentions"

describe("mention markup", () => {
  test("formatMention strips characters that would break the markup", () => {
    expect(formatMention("Anna [lead] (sales)\n", "42")).toBe(
      "@[Anna lead sales](42)",
    )
  })

  test("formatMention falls back to the id when the name is empty", () => {
    expect(formatMention("  []  ", "7")).toBe("@[7](7)")
  })

  test("sanitizeMentionName caps the name length", () => {
    expect(sanitizeMentionName("x".repeat(150))).toHaveLength(100)
  })

  test("parseMentionSegments splits text and mentions in order", () => {
    expect(parseMentionSegments("Hi @[Anna](42), ping @[Bob K](7)!")).toEqual([
      { type: "text", text: "Hi " },
      { type: "mention", name: "Anna", userId: "42" },
      { type: "text", text: ", ping " },
      { type: "mention", name: "Bob K", userId: "7" },
      { type: "text", text: "!" },
    ])
  })

  test("parseMentionSegments leaves malformed markup as text", () => {
    expect(parseMentionSegments("@[Anna](abc) and @Bob")).toEqual([
      { type: "text", text: "@[Anna](abc) and @Bob" },
    ])
  })

  test("extractMentionedUserIds returns distinct ids in first-seen order", () => {
    expect(
      extractMentionedUserIds("@[B](2) @[A](1) again @[B again](2)"),
    ).toEqual(["2", "1"])
  })

  test("extractMentionedUserIds is stable across repeated calls (no shared regex state)", () => {
    const text = "@[A](1)"
    expect(extractMentionedUserIds(text)).toEqual(["1"])
    expect(extractMentionedUserIds(text)).toEqual(["1"])
  })

  test("mentionsToPlainText renders mentions as @name", () => {
    expect(mentionsToPlainText("Call @[Anna](42) today")).toBe(
      "Call @Anna today",
    )
  })
})

describe("findMentionQuery", () => {
  test("detects a query right after @ at the start", () => {
    expect(findMentionQuery("@an", 3)).toEqual({ start: 0, query: "an" })
  })

  test("detects an empty query after a space", () => {
    expect(findMentionQuery("hello @", 7)).toEqual({ start: 6, query: "" })
  })

  test("allows a space inside the query (first and last name)", () => {
    expect(findMentionQuery("hey @Ivan P", 11)).toEqual({
      start: 4,
      query: "Ivan P",
    })
  })

  test("ignores @ inside a word such as an email", () => {
    expect(findMentionQuery("mail me@example", 15)).toBeNull()
  })

  test("stops at a line break", () => {
    expect(findMentionQuery("@an\nna", 6)).toBeNull()
  })

  test("returns null when the query starts with a space", () => {
    expect(findMentionQuery("@ anna", 6)).toBeNull()
  })

  test("returns null after an already inserted mention", () => {
    expect(findMentionQuery("@[Anna](42) ok", 14)).toBeNull()
  })
})

describe("insertMention", () => {
  test("replaces the typed query with markup and moves the caret after it", () => {
    const result = insertMention({
      text: "Ping @an please",
      start: 5,
      caret: 8,
      name: "Anna",
      userId: "42",
    })
    expect(result.text).toBe("Ping @[Anna](42) please")
    expect(result.caret).toBe("Ping @[Anna](42) ".length)
  })
})

describe("newlyMentionedUserIds", () => {
  test("returns only mentions added by the edit", () => {
    expect(
      newlyMentionedUserIds("@[A](1) hi", "@[A](1) hi @[B](2) @[C](3)"),
    ).toEqual(["2", "3"])
  })

  test("treats a missing previous text as empty", () => {
    expect(newlyMentionedUserIds(null, "@[A](1)")).toEqual(["1"])
  })

  test("returns nothing when mentions were only removed", () => {
    expect(newlyMentionedUserIds("@[A](1) @[B](2)", "@[A](1)")).toEqual([])
  })
})
