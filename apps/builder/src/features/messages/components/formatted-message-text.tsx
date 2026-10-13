import type { ReactNode } from "react"
import {
  type FormattedNode,
  hasFormattingMarkup,
  parseFormattedText,
} from "../lib/formatted-text"

const renderNodes = (nodes: FormattedNode[], keyPrefix: string): ReactNode[] =>
  nodes.map((node, index) => {
    const key = `${keyPrefix}.${index}`
    if (node.type === "text") {
      return node.value
    }
    if (node.type === "break") {
      return <br key={key} />
    }
    const children = renderNodes(node.children, key)
    switch (node.tag) {
      case "b":
        return <strong key={key}>{children}</strong>
      case "i":
        return <em key={key}>{children}</em>
      case "u":
        return <u key={key}>{children}</u>
      case "s":
        return <s key={key}>{children}</s>
      case "code":
        return (
          <code
            className="rounded bg-black/10 px-1 font-mono text-[0.9em] dark:bg-white/10"
            key={key}
          >
            {children}
          </code>
        )
      case "pre":
        return (
          <code
            className="my-1 block overflow-x-auto whitespace-pre rounded bg-black/10 px-2 py-1 font-mono text-[0.9em] dark:bg-white/10"
            key={key}
          >
            {children}
          </code>
        )
      case "blockquote":
        return (
          <span
            className="my-1 block border-current/40 border-s-2 ps-2 opacity-90"
            key={key}
          >
            {children}
          </span>
        )
      case "spoiler":
        return (
          <span
            className="rounded-sm bg-current/15 blur-[3px] transition hover:blur-none focus:blur-none"
            key={key}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focus reveals the spoiler for keyboard users
            tabIndex={0}
          >
            {children}
          </span>
        )
      case "a":
        return node.href ? (
          <a
            className="underline underline-offset-2"
            href={node.href}
            key={key}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            {children}
          </a>
        ) : (
          <span key={key}>{children}</span>
        )
      default:
        return <span key={key}>{children}</span>
    }
  })

/**
 * Message text with bot-sent HTML formatting (bold, links, …) rendered as
 * React elements through the allow-list parser — never as raw HTML.
 */
export const FormattedMessageText = ({ text }: { text: string }) => {
  if (!hasFormattingMarkup(text)) {
    return text
  }
  return <>{renderNodes(parseFormattedText(text), "n")}</>
}
