import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

const ctx = {
  auth: {
    secretText: "telegram-token",
  },
} as never

const basePayload = (contact: {
  phone_number: string
  first_name: string
  last_name?: string
  user_id?: number
  vcard?: string
}) => ({
  update_id: 1,
  message: {
    message_id: 10,
    from: {
      id: 100,
      is_bot: false,
      first_name: "Ada",
      last_name: "Lovelace",
    },
    chat: {
      id: 100,
      type: "private",
    },
    date: 1_765_440_000,
    contact,
  },
})

describe("receiveMessage: native contact share", () => {
  test("own contact (user_id matches sender) is written to IncomingContact.phoneNumber", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: basePayload({
          phone_number: "+15551234567",
          first_name: "Ada",
          user_id: 100,
        }),
      },
    })

    expect(result.contact.phoneNumber).toBe("+15551234567")
  })

  test("own contact is surfaced on contentAttributes with ownContact: true", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: basePayload({
          phone_number: "+15551234567",
          first_name: "Ada",
          user_id: 100,
        }),
      },
    })

    expect(result.message.contentAttributes).toEqual({
      type: "contact_share",
      phoneNumber: "+15551234567",
      ownContact: true,
      firstName: "Ada",
      lastName: undefined,
      userId: "100",
      vcard: undefined,
    })
  })

  test("foreign contact (user_id does not match sender) is NOT written to Contact.phoneNumber", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: basePayload({
          phone_number: "+15559999999",
          first_name: "Someone",
          last_name: "Else",
          user_id: 999,
        }),
      },
    })

    expect(result.contact.phoneNumber).toBeUndefined()
    expect(result.message.contentAttributes).toMatchObject({
      type: "contact_share",
      phoneNumber: "+15559999999",
      ownContact: false,
    })
  })

  test("contact without user_id (no Telegram account) cannot be proven own — NOT written", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: basePayload({
          phone_number: "+15551234567",
          first_name: "Ada",
        }),
      },
    })

    expect(result.contact.phoneNumber).toBeUndefined()
    expect(result.message.contentAttributes).toMatchObject({
      ownContact: false,
    })
  })

  test("a plain text message carries no contentAttributes and no phoneNumber", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            message_id: 11,
            from: { id: 100, is_bot: false, first_name: "Ada" },
            chat: { id: 100, type: "private" },
            date: 1_765_440_000,
            text: "hello",
          },
        },
      },
    })

    expect(result.contact.phoneNumber).toBeUndefined()
    expect(result.message.contentAttributes).toBeUndefined()
  })
})
