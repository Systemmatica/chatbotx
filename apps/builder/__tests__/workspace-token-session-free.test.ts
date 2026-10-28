// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import { describe, expect, test } from "vitest"

// Workspace-token routes have no browser session. Any query they call that
// starts with `assertCurrentUserCanAccessChatbot` therefore rejects every
// token caller ("User is not associated with this workspace"). This guard
// walks the imports of each workspace-token module and fails when one of the
// imported functions performs that session check.

const SRC = join(import.meta.dirname, "../src")
const IMPORT_RE = /import\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g
const FUNCTION_END_RE = /\n}\n/
const SRC_PREFIX_RE = /^src/
const TYPE_PREFIX_RE = /^\s*type\s+/

const collectTokenModules = (dir: string, found: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      collectTokenModules(path, found)
    } else if (
      path.endsWith("/api/workspace-token.ts") ||
      path.endsWith("/api/token-auth.ts")
    ) {
      found.push(path)
    }
  }
  return found
}

const resolveModule = (fromFile: string, specifier: string): string | null => {
  let base: string
  if (specifier.startsWith("@/")) {
    base = join(SRC, specifier.slice(2))
  } else if (specifier.startsWith(".")) {
    base = normalize(join(dirname(fromFile), specifier))
  } else {
    return null
  }
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const exportedBody = (source: string, name: string): string | null => {
  const start = source.search(
    new RegExp(`export (?:async function|const) ${name}\\b`),
  )
  if (start === -1) {
    return null
  }
  const rest = source.slice(start)
  const end = rest.search(FUNCTION_END_RE)
  return end === -1 ? rest : rest.slice(0, end)
}

describe("workspace-token routes", () => {
  const modules = collectTokenModules(SRC)

  test("are discovered", () => {
    expect(modules.length).toBeGreaterThan(10)
  })

  test.each(
    modules.map((path) => [path.replace(SRC, "src")]),
  )("%s never calls a session-only query", (relative) => {
    const file = join(SRC, relative.replace(SRC_PREFIX_RE, ""))
    const source = readFileSync(file, "utf8")
    const offenders: string[] = []

    for (const match of source.matchAll(IMPORT_RE)) {
      const target = resolveModule(file, match[2])
      if (!target) {
        continue
      }
      const targetSource = readFileSync(target, "utf8")
      const names = match[1]
        .split(",")
        .map((name) => name.replace(TYPE_PREFIX_RE, "").trim())
        .filter(Boolean)
      for (const name of names) {
        const body = exportedBody(targetSource, name)
        if (body?.includes("assertCurrentUserCanAccessChatbot")) {
          offenders.push(`${name} (${target.replace(SRC, "src")})`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
