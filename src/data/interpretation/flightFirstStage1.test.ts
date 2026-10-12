import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  admittedFlightBatch,
  bindFlightBatch,
} from "./__fixtures__/flightInterpretation";
import {
  airNzReturnText,
  airNzTableText,
  deltaRebookingText,
} from "./__fixtures__/flightFirstStage1";
import { interpretFlightBatch } from "./flightInterpretation";
import { projectFlightEvidenceCoverage } from "./flightEvidenceCoverage";
import { readFlightSourcePayload } from "./flightSourcePayload";

const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const now = () => "2026-10-06T00:00:00Z";
async function replay(
  texts: string[],
  form: Parameters<typeof admittedFlightBatch>[1] = "TEXT",
) {
  const batch = await admittedFlightBatch(texts, form);
  const getAccountId = async () => batch.request.binding.account_id;
  const context = await captureAccountRequestContext(
    batch.request.binding.trip_id,
    getAccountId,
  );
  const run = () => interpretFlightBatch(batch, { sha256, getAccountId, now });
  const source = await run();
  const evidence = await projectFlightEvidenceCoverage(
    context,
    source,
    batch.request.materials,
    sha256,
    getAccountId,
  );
  return { batch, context, source, evidence, run, getAccountId };
}

describe("Capture Flight-first sanitized source equivalents", () => {
  it("does not treat loyalty counts or aircraft digits as airline identifiers, while retaining alphanumeric carriers", async () => {
    const f = await replay(["245 miles\n700\n737-800\n3K123\nU2123"]);
    expect(f.source.candidates).toHaveLength(2);
    expect(
      f.source.candidates.every((c) =>
        /[A-Z]/.test(
          (c.occurrence.service.value as { operator_value: string }).operator_value,
        ),
      ),
    ).toBe(true);
    expect(f.evidence.coverage[0].unmapped[0].raw).toBe("245 miles\n700\n737-800");
  });
  it("does not assign airports from a deferred Ticket value to the flight", async () => {
    const f = await replay(["DL0040 ticket= AKL→NSN"]);
    expect(f.source.candidates[0].occurrence["origin.airport"]).toBeUndefined();
    expect(f.source.candidates[0].occurrence["destination.airport"]).toBeUndefined();
    expect(f.evidence.deferred[0].raw).toBe("ticket= AKL→NSN");
  });
  it.each(["ticket", "pnr", "passenger", "seat", "baggage", "fare", "cabin"])(
    "does not use a deferred %s value as the Flight departure date",
    async (dimension) => {
      const f = await replay([`Flight AKL→NSN ${dimension}= 2030-12-15`]);
      expect(f.source.candidates[0].occurrence["origin.local_date"]).toBeUndefined();
      expect(f.evidence.deferred[0].raw).toBe(`${dimension}= 2030-12-15`);
    },
  );
  it("validates derived-text ancestry to immutable original and refuses a missing parent", async () => {
    const batch = await admittedFlightBatch([airNzReturnText]);
    const original = structuredClone(batch.catalog.trip_source_representations[0]);
    const derivative = {
      ...original,
      id: "ca13b000-0000-4000-8000-000000009100",
      role: "DERIVED" as const,
      parent_ids: [original.id],
      transform_key: "synthetic-text-copy",
      transform_version: "1",
      transform_options_sha256: "0".repeat(64),
      regenerability: "POSSIBLE" as const,
    };
    batch.catalog.trip_source_representations.push(derivative);
    batch.request.materials[0].pin.representation_id = derivative.id;
    await bindFlightBatch(batch);
    const getAccountId = async () => batch.request.binding.account_id;
    const source = await interpretFlightBatch(batch, { sha256, getAccountId, now });
    expect(source.candidates).toHaveLength(2);
    expect(source.publication_request.inputs[0].representation_id).toBe(derivative.id);
    expect(batch.catalog.trip_source_representations[0]).toEqual(original);
    batch.catalog.trip_source_representations = [derivative];
    await expect(
      interpretFlightBatch(batch, { sha256, getAccountId, now }),
    ).rejects.toThrow();
  });
  it.each([
    "arrDate=2030-12-15",
    "arrDate= 2030-12-15",
    "arrDate: 2030-12-15",
    "arrInstant= 2030-12-15T10:35:00Z",
  ])("does not copy %s into departure", async (label) => {
    const f = await replay([`Flight AKL→NSN ${label} arr=10:35`]);
    expect(f.source.candidates[0].occurrence["origin.local_date"]).toBeUndefined();
  });
  it("does not assign a labelled arrival date or itinerary chain to departure or a single leg", async () => {
    const f = await replay(["DL0040 route=AKL→SYD→LAX arrDate=2030-12-15 arr=16:47"]);
    const c = f.source.candidates[0];
    expect(c.occurrence["origin.local_date"]).toBeUndefined();
    expect(c.occurrence["origin.airport"]).toBeUndefined();
    expect(c.occurrence["destination.airport"]).toBeUndefined();
    expect(c.occurrence["destination.local_date"].value).toBe("2030-12-15");
    expect(f.evidence.coverage[0].unmapped.map((u) => u.raw).join("\n")).toContain(
      "AKL→SYD→LAX",
    );
  });
  it("Air NZ 1→2 retains civil facts and common booking without assigning the subject number", async () => {
    const f = await replay([airNzReturnText], "EMAIL_TEXT");
    expect(f.source.candidates).toHaveLength(2);
    const candidates = [...f.source.candidates].sort((a, b) =>
      String(a.occurrence["origin.local_date"].value).localeCompare(
        String(b.occurrence["origin.local_date"].value),
      ),
    );
    expect(candidates.map((c) => c.occurrence["origin.local_date"].value)).toEqual([
      "2030-12-14",
      "2030-12-22",
    ]);
    expect(candidates.map((c) => c.occurrence["origin.airport"].value)).toEqual([
      { namespace: "IATA_AIRPORT", value: "AKL" },
      { namespace: "IATA_AIRPORT", value: "NSN" },
    ]);
    expect(candidates.map((c) => c.occurrence["origin.local_time"].value)).toMatchObject([
      { value: "09:00" },
      { value: "11:55" },
    ]);
    expect(
      candidates.map((c) => c.occurrence["destination.local_time"].value),
    ).toMatchObject([{ value: "10:35" }, { value: "13:25" }]);
    for (const c of candidates) {
      expect(c.occurrence.service).toBeUndefined();
      expect(c.proposal.fields.services).toBeUndefined();
      for (const role of ["origin", "destination"] as const) {
        expect(c.proposal.fields[role]?.proposed_value.time).toMatchObject({
          zone_id: null,
          source_instant: null,
        });
      }
      expect(c.proposal.fields.destination?.proposed_value.time.local_date).toBeNull();
    }
    expect(f.evidence.materials).toHaveLength(1);
    expect(f.evidence.coverage[0].unmapped.map((u) => u.raw).join("\n")).toContain(
      "SYNTHETIC-RETURN",
    );
    expect(f.evidence.coverage[0].unmapped.map((u) => u.raw).join("\n")).toContain(
      "synthetic-eticket.pdf",
    );
    expect(await f.run()).toEqual(f.source);
    expect(f.source).not.toHaveProperty("command");
  });

  it("Delta 1→4 preserves mention ordering, cropped/rebooking evidence and unknown leg assignments", async () => {
    const f = await replay([deltaRebookingText], "OCR_TEXT");
    expect(f.source.candidates).toHaveLength(4);
    const ordered = [...f.evidence.interpreted].sort(
      (a, b) =>
        a.fields[0].observations[0].evidence[0].locator.start! -
        b.fields[0].observations[0].evidence[0].locator.start!,
    );
    expect(
      ordered.map((c) => c.fields.find((x) => x.path === "service")!.observations[0].raw),
    ).toEqual(["QF0140", "DL0040", "DL0799", "DL4714"]);
    for (const c of f.source.candidates) {
      expect(c.proposal.fields.origin).toBeUndefined();
      expect(c.proposal.fields.destination).toBeUndefined();
      expect(c.anchors.every((a) => !a.qualified)).toBe(true);
    }
    const retained = f.evidence.coverage[0].unmapped.map((u) => u.raw).join("\n");
    for (const text of [
      "Flight Rebooked",
      "version 2",
      "28h47",
      "On Time",
      "cropped",
      "AKL→SYD→LAX→MSP→MDW",
    ])
      expect(retained).toContain(text);
    expect(await f.run()).toEqual(f.source);
  });

  it("maps every interpreted field to exact original raw bytes and pin without inferred confidence", async () => {
    const f = await replay([airNzReturnText, deltaRebookingText]);
    for (const candidate of f.evidence.interpreted)
      for (const field of candidate.fields)
        for (const observation of field.observations) {
          expect(observation).not.toHaveProperty("confidence");
          for (const evidence of observation.evidence) {
            expect(evidence.raw).toBe(observation.raw);
            const material = f.batch.request.materials.find(
              (m) => m.pin.id === evidence.pin.id,
            )!;
            expect(evidence.pin).toEqual(material.pin);
            expect(
              new TextDecoder().decode(
                new TextEncoder()
                  .encode(material.text)
                  .slice(evidence.locator.start!, evidence.locator.end!),
              ),
            ).toBe(observation.raw);
          }
        }
    expect(f.batch.request.materials.map((m) => m.text)).toEqual([
      airNzReturnText,
      deltaRebookingText,
    ]);
  });

  it("fails a malformed leg independently and retains the failed material and other outputs", async () => {
    const f = await replay([
      airNzReturnText,
      "Flight AKL→NSN occurrence=malformed",
      deltaRebookingText,
    ]);
    expect(f.source.status).toBe("PARTIAL");
    expect(f.source.candidates).toHaveLength(6);
    expect(f.evidence.materials).toHaveLength(3);
    expect(f.evidence.unprocessedInputIds).toEqual([f.batch.request.materials[1].pin.id]);
  });

  it("does not use a common booking or missing service identity to merge sparse legs", async () => {
    const f = await replay([
      "Flight AKL→NSN 2030-12-14 dep=09:00 pnr=SYNTHETIC-SHARED; ticket=SYNTHETIC-TICKET\nFlight NSN→AKL 2030-12-22 pnr=SYNTHETIC-SHARED; ticket=SYNTHETIC-TICKET",
      "Flight AKL→NSN 2030-12-14 dep=09:00 pnr=SYNTHETIC-SHARED",
    ]);
    expect(f.source.candidates).toHaveLength(3);
    expect(f.evidence.deferred.filter((d) => d.dimension === "bookings")).toHaveLength(3);
    expect(f.evidence.deferred.filter((d) => d.dimension === "tickets")).toHaveLength(2);
    expect(f.source.resolutions.every((r) => r.outcome !== "SAME_ITEM")).toBe(true);
  });

  it("retains changed rebooking source without treating it as automatic continuity", async () => {
    const f = await replay([
      "DL0040 AKL→CHC 2030-12-14 dep=06:00",
      "DL0040 AKL→CHC 2030-12-14 dep=07:00 change=Flight Rebooked version 2",
    ]);
    expect(f.source.candidates).toHaveLength(2);
    expect(f.source.resolutions[0]).toMatchObject({
      outcome: "UNRESOLVED_MATCH",
      reason: "CONTINUITY_REVIEW_REQUIRED",
    });
    expect(
      f.evidence.interpreted
        .flatMap((c) => c.fields)
        .some((field) => field.path === "change_notice"),
    ).toBe(true);
  });

  it("rejects missing original and stale content without interpreting replacements", async () => {
    const f = await replay([airNzReturnText]);
    f.batch.catalog.trip_source_representations = [];
    await expect(f.run()).rejects.toThrow();
    const g = await replay([airNzReturnText]);
    g.batch.request.materials[0].text += " revised";
    await expect(g.run()).rejects.toThrow("INPUT_STALE");
  });

  it("rejects corrupt field evidence and Account A→B→A callbacks", async () => {
    const f = await replay([airNzReturnText]);
    const changed = structuredClone(f.source);
    changed.candidates[0].occurrence["origin.local_time"].observations[0].raw =
      "dep=18:00";
    await expect(
      projectFlightEvidenceCoverage(
        f.context,
        changed,
        f.batch.request.materials,
        sha256,
        f.getAccountId,
      ),
    ).rejects.toThrow("EVIDENCE_INVALID");
    advanceAccountGeneration();
    advanceAccountGeneration();
    await expect(
      projectFlightEvidenceCoverage(
        f.context,
        f.source,
        f.batch.request.materials,
        sha256,
        f.getAccountId,
      ),
    ).rejects.toThrow();
  });
});

describe("local Flight source capability boundary", () => {
  it("uses bounded original reads and passes UTF8 text to the existing interpretation path", async () => {
    const f = await replay([airNzReturnText]);
    const read = await readFlightSourcePayload(
      f.context,
      "TEXT",
      { text: airNzReturnText },
      sha256,
      f.getAccountId,
    );
    expect(read.status).toBe("TEXT_AVAILABLE");
    expect(read.text).toBe(f.batch.request.materials[0].text);
    expect(read.original.sha256).toBe(f.batch.request.materials[0].pin.payload_sha256);
    expect(read.original.byteCount).toBe(f.batch.request.materials[0].pin.byte_count);
  });

  it.each(["FILE", "IMAGE"] as const)(
    "preserves %s bytes and returns unavailable without sniffing or claiming media verification",
    async (kind) => {
      const f = await replay([airNzReturnText]);
      const bytes = new TextEncoder().encode(
        "SYNTHETIC binary; dep=06:00 is not extracted text",
      );
      let offset = 0;
      const reader = {
        read: vi.fn(async (max: number) => {
          expect(max).toBeLessThanOrEqual(65536);
          if (offset === bytes.length) return null;
          const chunk = bytes.slice(offset, offset + 5);
          offset += chunk.length;
          return chunk;
        }),
        close: vi.fn(async () => {}),
      };
      const result = await readFlightSourcePayload(
        f.context,
        kind,
        { reader },
        sha256,
        f.getAccountId,
      );
      expect(result).toMatchObject({
        status: "CAPABILITY_UNAVAILABLE",
        mediaVerification: "UNKNOWN",
        text: null,
      });
      expect(result.original.bytes).toEqual(bytes);
      expect(reader.close).toHaveBeenCalledOnce();
    },
  );

  it("closes a partial reader on failure without exposing private diagnostic text", async () => {
    const f = await replay([airNzReturnText]);
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce(new Uint8Array([1]))
        .mockRejectedValueOnce(new Error("PRIVATE fixture")),
      close: vi.fn(async () => {}),
    };
    await expect(
      readFlightSourcePayload(f.context, "FILE", { reader }, sha256, f.getAccountId),
    ).rejects.toThrow("READER_FAILURE");
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it.each(["nul", "oversize", "invalid-utf8"])(
    "rejects %s text rather than replacing or silently truncating it",
    async (kind) => {
      const f = await replay([airNzReturnText]);
      const bytes =
        kind === "nul"
          ? new Uint8Array([0])
          : kind === "oversize"
            ? new Uint8Array(262145).fill(65)
            : new Uint8Array([255]);
      await expect(
        readFlightSourcePayload(f.context, "TEXT", { bytes }, sha256, f.getAccountId),
      ).rejects.toThrow();
    },
  );

  it("fences Account changes during payload hashing", async () => {
    const f = await replay([airNzReturnText]);
    await expect(
      readFlightSourcePayload(
        f.context,
        "TEXT",
        { text: airNzReturnText },
        async (bytes) => {
          advanceAccountGeneration();
          return sha256(bytes);
        },
        f.getAccountId,
      ),
    ).rejects.toThrow();
  });
});

describe("Native text table grammar", () => {
  it("interprets a native-text flight table with full dates and source place labels without airport mapping", async () => {
    const f = await replay([airNzTableText], "EMAIL_TEXT");
    const cs = [...f.source.candidates].sort((a, b) =>
      String(a.occurrence["origin.local_date"].value).localeCompare(
        String(b.occurrence["origin.local_date"].value),
      ),
    );
    expect(cs).toHaveLength(2);
    expect(
      cs.map((c) => c.proposal.fields.origin!.proposed_value.location.authored_label),
    ).toEqual(["Auckland", "Nelson"]);
    expect(
      cs.map(
        (c) => c.proposal.fields.destination!.proposed_value.location.authored_label,
      ),
    ).toEqual(["Nelson", "Auckland"]);
    expect(
      cs.map((c) => c.proposal.fields.origin!.proposed_value.time.local_date),
    ).toEqual(["2030-12-14", "2030-12-22"]);
    expect(
      cs.map((c) => c.proposal.fields.destination!.proposed_value.time.local_time),
    ).toEqual(["10:35", "13:25"]);
    for (const c of cs) {
      expect(c.proposal.fields.services).toBeUndefined();
      expect(c.anchors.every((a) => !a.qualified && a.originAirportId === "")).toBe(true);
      expect(c.proposal.fields.origin!.proposed_value.time).toMatchObject({
        zone_id: null,
        source_instant: null,
      });
    }
    expect(f.evidence.coverage[0].unmapped.map((x) => x.raw).join("\n")).toContain(
      "SYNTHETIC-TABLE-ORDER",
    );
    expect(await f.run()).toEqual(f.source);
  });
  it("coalesces adjacent unmapped email lines losslessly without exhausting coverage slots", async () => {
    const lines = Array.from(
      { length: 100 },
      (_, i) => `Synthetic footer line ${i}`,
    ).join("\n");
    const f = await replay([`${lines}\n${airNzTableText}`]);
    expect(f.source.status).toBe("SUCCEEDED");
    expect(f.source.candidates).toHaveLength(2);
    expect(f.evidence.coverage[0].unmapped[0].raw).toContain(lines);
  });
  it.each(["missing-year", "missing-arrival", "no-flight-section"])(
    "preserves %s table uncertainty",
    async (kind) => {
      let text = airNzTableText;
      if (kind === "missing-year") text = text.replaceAll("2030", "");
      if (kind === "missing-arrival")
        text = text.replaceAll("Arrival", "Unknown endpoint");
      if (kind === "no-flight-section")
        text = text.replace("Your flights", "Other travel document");
      const f = await replay([text]);
      expect(f.source.candidates).toHaveLength(0);
      expect(f.evidence.materials[0].text).toBe(text);
    },
  );
  it("normalizes explicit midnight/noon and retains invalid date/clock as unknown", async () => {
    const f = await replay([
      airNzTableText
        .replace("9:00 AM", "12:00 AM")
        .replace("10:35 AM", "12:00 PM")
        .replace("11:55 AM", "13:55 AM")
        .replaceAll("22 Dec 2030", "31 Feb 2030"),
    ]);
    const times = f.source.candidates.map(
      (c) => c.proposal.fields.origin?.proposed_value.time,
    );
    expect(times.some((t) => t?.local_time === "00:00")).toBe(true);
    expect(
      f.source.candidates.some(
        (c) => c.proposal.fields.destination?.proposed_value.time.local_time === "12:00",
      ),
    ).toBe(true);
    expect(
      f.source.candidates.some(
        (c) =>
          c.occurrence["origin.local_date"].value === null &&
          c.occurrence["origin.local_time"].value === null,
      ),
    ).toBe(true);
  });
});

describe("Flight table scope and conflicting endpoints", () => {
  it("keeps exact UTF-8 ignored offsets across mapped rows", async () => {
    const text = "中文页眉\n备注 ✈️\nDL0040\n中文页脚\n结束";
    const f = await replay([text]);
    const bytes = new TextEncoder().encode(text);
    const unmapped = f.evidence.coverage[0].unmapped;
    expect(unmapped.map((u) => u.raw)).toEqual(["中文页眉\n备注 ✈️", "中文页脚\n结束"]);
    for (const u of unmapped) {
      expect(
        new TextDecoder().decode(bytes.slice(u.locator.start!, u.locator.end!)),
      ).toBe(u.raw);
    }
  });
  it("does not reuse a stale Flight header in a train section", async () => {
    const f = await replay([
      "Your flights\nNo flights in this section\nYour trains\n" +
        airNzTableText.split("Your flights\n")[1],
    ]);
    expect(f.source.candidates).toHaveLength(0);
  });
  it("retains heading versus endpoint disagreement instead of selecting one", async () => {
    const f = await replay([
      airNzTableText.replace("14 Dec 2030\nAuckland", "14 Dec 2030\nChristchurch"),
    ]);
    const c = f.source.candidates.find(
      (c) => c.occurrence["origin.place_label"].knowledge === "AMBIGUOUS",
    )!;
    expect(c.contradictions.some((x) => x.path === "origin.place_label")).toBe(true);
    expect(c.proposal.fields.origin).toBeUndefined();
    expect(c.occurrence["origin.place_label"].observations.map((o) => o.raw)).toEqual(
      expect.arrayContaining(["Auckland to Nelson", "Christchurch"]),
    );
  });
});
