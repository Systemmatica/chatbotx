"use server"

import {
  type ContactAccessScope,
  contactService,
  staffNotificationService,
} from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactNoteModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { newlyMentionedUserIds } from "@chatbotx.io/utils/mentions"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateContactNoteRequest,
  updateContactNoteRequest,
} from "../schemas/action"

export const editContactNoteAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateContactNoteRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
      ctx: { user },
    } = props
    const accessScope = await requireContactPermissionScope(workspaceId)

    return await editContactNote(
      { workspaceId, id, accessScope, userId: (user as UserModel).id },
      parsedInput,
    )
  })

export const editContactNote = async (
  ctx: {
    workspaceId: string
    id: string
    accessScope?: ContactAccessScope
    /** The editor; mentions added by the edit are notified on their behalf. */
    userId?: string
  },
  parsedInput: UpdateContactNoteRequest,
) => {
  const contact = await contactService.findByIdOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    accessScope: ctx.accessScope,
  })

  const foundContactNote = await findOrFail({
    table: contactNoteModel,
    where: {
      contactId: contact.id,
      id: parsedInput.contactNoteId,
    },
    message: "Contact note not found",
  })

  const updatedContactNote = await db
    .update(contactNoteModel)
    .set({
      text: parsedInput.text,
    })
    .where(eq(contactNoteModel.id, foundContactNote.id))
    .returning()
    .then((result) => result[0])

  if (ctx.userId && parsedInput.text !== undefined) {
    // Only mentions the edit added; best-effort (never throws).
    await staffNotificationService.notifyNoteMention({
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      authorUserId: ctx.userId,
      text: parsedInput.text,
      mentionedUserIds: newlyMentionedUserIds(
        foundContactNote.text,
        parsedInput.text,
      ),
    })
  }

  return updatedContactNote
}
