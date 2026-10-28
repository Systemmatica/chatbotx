import { foldersAuthenticatedAPI } from "./authenticated"
import foldersWorkspaceTokenAPIs from "./workspace-token"

export const foldersAPI = {
  ...foldersWorkspaceTokenAPIs,
  ...foldersAuthenticatedAPI,
}
