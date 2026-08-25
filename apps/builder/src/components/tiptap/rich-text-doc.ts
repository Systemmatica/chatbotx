import type { TiptapNode } from "@chatbotx.io/flow-config"
import { gitHubEmojis, shortcodeToEmoji } from "@tiptap/extension-emoji"

/**
 * `tiptapDocToRichText` (flow-config) only understands `text`/`hardBreak`
 * nodes — it deliberately has no tiptap dependency, so it can't resolve the
 * two atom node types this editor also uses: `mention` (variable injection)
 * and `emoji`. This flattens both into plain text nodes first, inheriting
 * whatever marks were on the atom, so the flow-config serializer never has
 * to know either extension exists.
 */
export const flattenAtomsToText = (doc: TiptapNode): TiptapNode => {
  const walk = (node: TiptapNode): TiptapNode => {
    if (node.type === "mention") {
      const id = typeof node.attrs?.id === "string" ? node.attrs.id : ""
      return { type: "text", text: `{{${id}}}`, marks: node.marks }
    }

    if (node.type === "emoji") {
      const name = typeof node.attrs?.name === "string" ? node.attrs.name : ""
      const emojiItem = shortcodeToEmoji(name, gitHubEmojis)
      return {
        type: "text",
        text: emojiItem?.emoji || `:${name}:`,
        marks: node.marks,
      }
    }

    if (node.content) {
      return { ...node, content: node.content.map(walk) }
    }

    return node
  }

  return walk(doc)
}
