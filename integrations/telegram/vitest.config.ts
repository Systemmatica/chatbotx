import preset, { mswSetupFiles } from "@chatbotx.io/vitest-config/node"
import { mergeConfig, type ViteUserConfig } from "vitest/config"

/**
 * MSW is opt-in (see `vitest-config/src/node.ts`) — the video_note tests mock
 * the Telegram Bot API's `getFile` + file-download calls, so this workspace
 * re-adds the server lifecycle on top of the preset.
 */
const config: ViteUserConfig = mergeConfig(preset, {
  test: {
    setupFiles: [...mswSetupFiles],
  },
})

export default config
