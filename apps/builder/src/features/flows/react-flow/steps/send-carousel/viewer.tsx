"use client"

import type { SendCarouselStepSchema } from "@chatbotx.io/flow-config"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useUpdateNodeInternals } from "@xyflow/react"
import { useEffect } from "react"
import { NODE_CARD_CONTENT_WIDTH_CLASS } from "@/features/flows/react-flow/nodes/node-dimensions"
import SendCardStepViewer from "@/features/flows/react-flow/steps/send-card/viewer"

/** The node card's inner width (card minus its `p-4`), so one card fills it. */
const CAROUSEL_CARD_WIDTH = NODE_CARD_CONTENT_WIDTH_CLASS

/** 12px — the gutter seen between two cards. */
const CAROUSEL_CARD_GAP = "gap-3"

/**
 * 16px — cancels the node's own inline-end padding.
 *
 * The first card fills the node frame while the rest spill outside it, so the
 * node's `p-4` already sits between card one and card two. Adding it back keeps
 * the gutter even from the node border onward instead of letting the second
 * card crowd the frame. Use the logical end side so the spill stays correct in
 * both LTR and RTL locales.
 */
const FIRST_CARD_FRAME_OFFSET = "me-4"

type SendCarouselStepViewerProps = {
  data: SendCarouselStepSchema
  nodeId?: string
}

const SendCarouselCards = ({ data, nodeId }: SendCarouselStepViewerProps) => {
  const updateNodeInternals = useUpdateNodeInternals()

  // Card content changes can add, remove, or move source handles.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cards is an intentional geometry trigger
  useEffect(() => {
    if (nodeId) {
      updateNodeInternals(nodeId)
    }
  }, [data.cards, nodeId, updateNodeInternals])

  if (data.cards.length === 0) {
    return null
  }

  return (
    <div
      className={cn("flex w-max items-start", CAROUSEL_CARD_GAP)}
      data-slot="send-carousel-cards"
    >
      {data.cards.map((card, cardIndex) => (
        <div
          className={cn(
            CAROUSEL_CARD_WIDTH,
            "shrink-0",
            cardIndex === 0 && FIRST_CARD_FRAME_OFFSET,
          )}
          data-carousel-card-id={card.id}
          key={card.id}
        >
          <SendCardStepViewer data={card} />
        </div>
      ))}
    </div>
  )
}

const SendCarouselStepViewer = (props: SendCarouselStepViewerProps) => (
  <SendCarouselCards {...props} />
)

export default SendCarouselStepViewer
