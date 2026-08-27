import type { IamCapability } from "./iam.ts";

export function adminCapabilityForAction(
  action: unknown,
): IamCapability | null {
  if (action === "change_role") return "iam.role.delegate";
  if (
    action === "list" || action === "create_draft" || action === "publish" ||
    action === "set_status"
  ) {
    return "gmad.batch.manage";
  }
  return null;
}
