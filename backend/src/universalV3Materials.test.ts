import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { projectUniversalV3Candidates } from "./universalV3Materials";
const files = [0, 1, 2].map(() => ({
  fileId: randomUUID(),
  documentId: randomUUID(),
  mediaType: "text/plain" as const,
  length: 10,
  sha256: "a".repeat(64),
}));
const manifest = {
  version: "otr.import.local-first/1" as const,
  tripId: randomUUID(),
  mode: "UNIVERSAL" as const,
  files,
};
it("preserves precise one-to-many, many-to-one and many-to-many input bindings", () => {
  const rows = projectUniversalV3Candidates(
    {
      items: [
        {
          kind: "P1",
          subtype: "ACTIVITY",
          fields: { "activity.name": "Museum" },
          inputs: [0],
        },
        {
          kind: "P3",
          subtype: "ACCOMMODATION",
          fields: { "property.name": "Hotel" },
          inputs: [0, 1, 1],
        },
        {
          kind: "P6",
          subtype: "ACTIVITY",
          fields: { "activity.name": "Concert" },
          inputs: [1, 2],
        },
      ],
    },
    manifest,
  );
  expect(rows.map((row) => row.documentIds)).toEqual([
    [files[0].documentId],
    [files[0].documentId, files[1].documentId],
    [files[1].documentId, files[2].documentId],
  ]);
});
it("retains no candidates for abstention and rejects invalid source membership", () => {
  expect(projectUniversalV3Candidates({ items: [] }, manifest)).toEqual([]);
  expect(
    projectUniversalV3Candidates(
      {
        items: [
          {
            kind: "P1",
            subtype: "ACTIVITY",
            fields: { title: "Unknown document" },
            inputs: [3],
          },
        ],
      },
      manifest,
    ),
  ).toEqual([]);
});
