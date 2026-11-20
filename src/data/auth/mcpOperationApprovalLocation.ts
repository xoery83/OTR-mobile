import { z } from "zod";

export function operationApprovalIdFromUrl(url: URL): string {
  const params = new URLSearchParams(url.search);
  // ChatGPT appends attribution when opening links; it is never approval authority.
  if (
    params.getAll("utm_source").length === 1 &&
    params.get("utm_source") === "chatgpt.com"
  )
    params.delete("utm_source");
  if (
    url.pathname !== "/mcp/approve" ||
    params.getAll("approval_id").length !== 1 ||
    [...params.keys()].some((key) => key !== "approval_id")
  )
    throw Error("OPERATION_APPROVAL_LOCATION_INVALID");
  return z.uuid().parse(params.get("approval_id"));
}
