import { afterEach, expect, it, vi } from "vitest";
import { runGolden } from "./golden";

afterEach(() => vi.unstubAllEnvs());

it.each(["READY", "BLOCKED"])(
  "retains the normal QA gate when Native is %s",
  async (state) => {
    vi.stubEnv("OTR_MCP_QA_CASE", "NELSON_DATE_EDIT");
    vi.stubEnv("OTR_MCP_NATIVE_NELSON_READY", state === "READY" ? "1" : "");
    vi.stubEnv(
      "OTR_MCP_NATIVE_NELSON_BLOCKED",
      state === "BLOCKED" ? "DEVICE_AUTOMATION" : "",
    );
    vi.stubEnv("OTR_QA_DEV_BUSINESS_WINDOW", "NOT_HELD");
    await expect(runGolden("NELSON_DATE_EDIT")).rejects.toMatchObject({
      code: "ERR_ASSERTION",
      expected: "HELD",
    });
  },
);

it.each([false, true])(
  "rejects missing or contradictory Native evidence (%s)",
  async (both) => {
    vi.stubEnv("OTR_MCP_QA_CASE", "NELSON_DATE_EDIT");
    vi.stubEnv("OTR_MCP_NATIVE_NELSON_READY", both ? "1" : "");
    vi.stubEnv("OTR_MCP_NATIVE_NELSON_BLOCKED", both ? "DEVICE_AUTOMATION" : "");
    await expect(runGolden("NELSON_DATE_EDIT")).rejects.toThrow(
      "ACTUAL_NATIVE_CHECKPOINT_OR_RECORDED_DEVICE_BLOCK_REQUIRED",
    );
  },
);
