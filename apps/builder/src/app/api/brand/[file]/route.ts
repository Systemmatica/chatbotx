import {
  configuredBrandName,
  renderMonogramSvg,
  renderWordmarkSvg,
} from "@chatbotx.io/business"

// Generated text logo for instances that set PLATFORM_BRAND_NAME without a
// logo image (see `defaultBrandAssets` in the platform settings).
const FILES = {
  "wordmark-light.svg": (name: string) => renderWordmarkSvg(name, "light"),
  "wordmark-dark.svg": (name: string) => renderWordmarkSvg(name, "dark"),
  "icon-light.svg": (name: string) => renderMonogramSvg(name, "light"),
  "icon-dark.svg": (name: string) => renderMonogramSvg(name, "dark"),
} as const

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params
  const name = configuredBrandName()
  const render = FILES[file as keyof typeof FILES]
  if (!(name && render)) {
    return new Response("Not found", { status: 404 })
  }
  return new Response(render(name), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
