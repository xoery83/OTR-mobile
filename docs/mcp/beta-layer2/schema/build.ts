import { z } from "zod";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { callSchemas, registry } from "./requests";
import { planEnvelopeSchema, refSchema } from "./plan";
import { responseSchemas } from "./responses";
export const refs = z.toJSONSchema(refSchema, { io: "input" });
// Ref substitution is structural only; original validators run after dependency resolution.
export function template(s: any): any {
  if (typeof s === "boolean") return s;
  const t = { ...s };
  if (t.type === "object" && t.properties && t.additionalProperties === undefined)
    t.additionalProperties = false;
  if (t.properties)
    t.properties = Object.fromEntries(
      Object.entries(t.properties).map(([k, v]) => [k, template(v)]),
    );
  if (t.items) t.items = template(t.items);
  if (t.additionalProperties && typeof t.additionalProperties === "object")
    t.additionalProperties = template(t.additionalProperties);
  for (const key of ["anyOf", "oneOf", "allOf"])
    if (t[key]) t[key] = t[key].map(template);
  return { anyOf: [t, { $ref: "#/$defs/Ref" }] };
}
export const concreteCalls = callSchemas.map((c) =>
  z.toJSONSchema(c, { io: "input", unrepresentable: "throw" }),
);
export const calls = concreteCalls.map((c: any, i) => ({
  ...c,
  properties: {
    ...c.properties,
    pathParams: template(c.properties.pathParams),
    query: template(c.properties.query),
    request: template(c.properties.request),
  },
  "x-capability": registry[i].capabilityId,
  "x-request-schema": registry[i].requestSchema,
  "x-semantic-validator":
    "schema/requests.ts:requestSchema + pinned Zod refinements AFTER reference resolution",
}));
export const schema: any = z.toJSONSchema(planEnvelopeSchema, { io: "input" });
schema.$id = "otr.mcp-beta.plan/1.0.0";
schema.$defs = { Ref: refs, ApiCall: { oneOf: calls } };
schema.properties.steps.items.properties.call = {
  anyOf: [{ type: "null" }, { $ref: "#/$defs/ApiCall" }],
};
schema["x-source-pins"] = "../beta-contract-v1/SOURCE_PINS_V1.json";
schema["x-semantic-assertion-manifest"] = "SEMANTIC_ASSERTIONS.json";
schema["x-required-semantic-validation"] = [
  "validate.ts: dependency/reference/confirmation guards",
  "requests.ts: original Zod refinements after all references resolve",
  "Authority permission/CAS/field_state checks at future execution",
];
const shared: Record<string, any> = {};
function compact(node: any): any {
  if (Array.isArray(node)) return node.map(compact);
  if (!node || typeof node !== "object") return node;
  const next: any = { ...node };
  delete next.$schema;
  if (next.properties)
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([k, v]) => [k, compact(v)]),
    );
  if (next.items) next.items = compact(next.items);
  if (next.additionalProperties && typeof next.additionalProperties === "object")
    next.additionalProperties = compact(next.additionalProperties);
  for (const k of ["anyOf", "oneOf", "allOf"])
    if (next[k]) next[k] = next[k].map(compact);
  const encoded = JSON.stringify(next);
  if (encoded.length < 400) return next;
  const key = "S" + createHash("sha256").update(encoded).digest("hex").slice(0, 16);
  shared[key] = next;
  return { $ref: "#/$defs/" + key };
}
const compactRoot = compact({ ...schema, $defs: undefined });
const root = { ...shared[compactRoot.$ref.split("/").pop()]! };
const refRoot = compact(refs);
const callRoot = compact({ oneOf: calls });
root.$defs = { ...shared, Ref: refRoot, ApiCall: callRoot };
root.$schema = "https://json-schema.org/draft/2020-12/schema";
writeFileSync(
  new URL("../tool-planning.schema.json", import.meta.url),
  JSON.stringify(root, null, 2) + "\n",
);
console.log("Generated strict Plan schema, " + calls.length + " capability branches");

writeFileSync(
  new URL("../response-schemas.json", import.meta.url),
  JSON.stringify(
    {
      contractVersion: "otr.mcp-beta.contract/1.0.0",
      sourcePins: "SCHEMA_SOURCE_PINS.json",
      semanticValidators: "schema/responses.ts + pinned owning Zod refinements",
      schemas: Object.fromEntries(
        Object.entries(responseSchemas).map(([name, s]) => [
          name,
          z.toJSONSchema(s, { io: "input" }),
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
);
