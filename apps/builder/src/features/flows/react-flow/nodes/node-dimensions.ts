/**
 * Node card width on the canvas, in px.
 *
 * Sized so a message preview wraps like a chat bubble on a phone: the card's
 * `p-4` plus the bubble's `px-4` leave a ~296px text column, which at the
 * preview's 15px font fits the same 6–8 words per line a mobile messenger does.
 * Keep `NODE_CARD_WIDTH_CLASS` in sync (Tailwind needs a literal class name).
 */
export const NODE_CARD_WIDTH_PX = 360

/** Tailwind width class for the node card — must equal `NODE_CARD_WIDTH_PX`. */
export const NODE_CARD_WIDTH_CLASS = "w-[360px]"

/** Inner content width of the card (`NODE_CARD_WIDTH_PX` minus `p-4` x2). */
export const NODE_CARD_CONTENT_WIDTH_CLASS = "w-[328px]"
