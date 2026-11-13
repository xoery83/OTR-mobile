import { createHash } from "node:crypto";

export const memberClaimWiringBaseSHA256 =
  "434b8612777ba7907ca467fbee4adfed16ab236d090860d50d48ea83b5df78ee";

// Pure candidate rendering for Root's shared file; never edits the owning worktree.
export function renderMemberClaimWiring(source: string): string {
  if (createHash("sha256").update(source).digest("hex") !== memberClaimWiringBaseSHA256)
    throw Error("MEMBER_WIRING_FIXED_BASE_REQUIRED");
  const replacements = [
    [
      '} from "./tripPersonCloudCreateHttp";',
      '} from "./tripPersonCloudCreateHttp";\nimport { tripMemberClaimBoundary } from "./tripMemberClaimHttp";\nimport type { MemberClaimAuthorityPort } from "./tripMemberClaimAuthority";',
    ],
    [
      "  tripPersonCloudCreatePort?: TripPersonCloudCreatePort;",
      "  tripPersonCloudCreatePort?: TripPersonCloudCreatePort;\n  memberClaimPort?: MemberClaimAuthorityPort;",
    ],
    [
      "  captureRemoteProcessing,\n  tripPersonCloudCreatePort,\n",
      "  captureRemoteProcessing,\n  tripPersonCloudCreatePort,\n  memberClaimPort,\n",
    ],
    [
      "      } else if (\n        /^\\/v2\\/trips\\/[^/]+\\/(?:people|person-create-operations\\/[^/]+)$/.test(",
      `      } else if (
        /^\\/v2\\/trips\\/[^/]+\\/member-claim-operations(?:\\/recovery)?$/.test(url.pathname)
      ) {
        route = "/v2/trips/:tripId/member-claim-operations/:resource";
        const actor = await authenticateNormalAccount(request, gateway);
        response = await tripMemberClaimBoundary(request, actor, memberClaimPort);
      } else if (
        /^\\/v2\\/trips\\/[^/]+\\/(?:people|person-create-operations\\/[^/]+)$/.test(`,
    ],
  ] as const;
  let result = source;
  for (const [before, after] of replacements) {
    if (result.split(before).length !== 2)
      throw Error("MEMBER_WIRING_EXACT_ANCHOR_REQUIRED");
    result = result.replace(before, after);
  }
  return result;
}
