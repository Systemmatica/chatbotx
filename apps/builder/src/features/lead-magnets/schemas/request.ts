import {
  LEAD_MAGNET_DESCRIPTION_MAX_LENGTH,
  LEAD_MAGNET_NAME_MAX_LENGTH,
  LEAD_MAGNET_URL_MAX_LENGTH,
  leadMagnetKinds,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

const leadMagnetName = z.string().trim().min(1).max(LEAD_MAGNET_NAME_MAX_LENGTH)
const leadMagnetUrl = z
  .string()
  .trim()
  .max(LEAD_MAGNET_URL_MAX_LENGTH)
  .nullable()
const leadMagnetDescription = z
  .string()
  .trim()
  .max(LEAD_MAGNET_DESCRIPTION_MAX_LENGTH)
  .nullable()

export const leadMagnetIdRequest = withWorkspaceIdSchema.and(
  z.object({ leadMagnetId: zodBigintAsString() }),
)

export const listLeadMagnetsRequest = withWorkspaceIdSchema

export const createLeadMagnetRequest = withWorkspaceIdSchema.and(
  z.object({
    name: leadMagnetName,
    kind: leadMagnetKinds,
    url: leadMagnetUrl.optional(),
    description: leadMagnetDescription.optional(),
  }),
)

export const updateLeadMagnetRequest = leadMagnetIdRequest.and(
  z.object({
    name: leadMagnetName.optional(),
    kind: leadMagnetKinds.optional(),
    url: leadMagnetUrl.optional(),
    description: leadMagnetDescription.optional(),
  }),
)
