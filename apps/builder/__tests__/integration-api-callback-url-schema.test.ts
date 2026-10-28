import { describe, expect, test } from "vitest"
import {
  createApiRequest,
  updateApiRequest,
} from "@/features/integration-api/schema/mutation"

describe("API channel callbackUrl schema", () => {
  test("accepts an empty callbackUrl on create and normalizes it to null", () => {
    const result = createApiRequest.safeParse({
      name: "My API",
      callbackUrl: "",
    })

    expect(result.success).toBe(true)
    expect(result.data?.callbackUrl).toBeNull()
  })

  test("accepts an omitted callbackUrl on create", () => {
    const result = createApiRequest.safeParse({ name: "My API" })

    expect(result.success).toBe(true)
    expect(result.data?.callbackUrl).toBeUndefined()
  })

  test("keeps a valid callbackUrl", () => {
    const result = createApiRequest.safeParse({
      name: "My API",
      callbackUrl: "https://example.com/hook",
    })

    expect(result.data?.callbackUrl).toBe("https://example.com/hook")
  })

  test("still rejects a malformed callbackUrl", () => {
    expect(
      createApiRequest.safeParse({ name: "My API", callbackUrl: "not a url" })
        .success,
    ).toBe(false)
  })

  test("treats an empty callbackUrl on update as clearing it", () => {
    const result = updateApiRequest.safeParse({ callbackUrl: "" })

    expect(result.success).toBe(true)
    expect(result.data?.callbackUrl).toBeNull()
  })
})
