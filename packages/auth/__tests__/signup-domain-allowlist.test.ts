import { describe, expect, test } from "vitest"
import {
  isSignupEmailAllowed,
  parseAllowedSignupDomains,
} from "../src/signup-allowlist"

describe("sign-up email domain allowlist", () => {
  test("empty allowlist keeps sign-up open", () => {
    expect(parseAllowedSignupDomains("")).toEqual([])
    expect(isSignupEmailAllowed("anyone@gmail.com", [])).toBe(true)
  })

  test("parses a comma list, trims, lowercases and drops a leading @", () => {
    expect(parseAllowedSignupDomains(" Example.com, @example.org ,")).toEqual([
      "example.com",
      "example.org",
    ])
  })

  test("allows only listed domains, case-insensitively", () => {
    const domains = ["example.com"]
    expect(isSignupEmailAllowed("Ann@Example.COM", domains)).toBe(true)
    expect(isSignupEmailAllowed("bob@gmail.com", domains)).toBe(false)
    expect(isSignupEmailAllowed("eve@sub.example.com", domains)).toBe(false)
    expect(isSignupEmailAllowed("not-an-email", domains)).toBe(false)
  })
})
