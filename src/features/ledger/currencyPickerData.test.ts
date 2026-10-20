import { describe, expect, it } from "vitest";

import { SUPPORTED_CURRENCY_CODES } from "@/domain/ledger/currency";

import currencyNames from "./currencyNames.json";
import {
  currencyName,
  searchCurrencies,
  suggestedCurrencies,
} from "./currencyPickerData";

describe("currency picker data", () => {
  it("keeps suggestions unique, ordered and capped at six", () => {
    expect(
      suggestedCurrencies(["ISK", "NZD", "EUR", "DKK", "USD", "USD", "JPY"]),
    ).toEqual(["ISK", "NZD", "EUR", "DKK", "USD", "JPY"]);
    expect(suggestedCurrencies(["NZD"])).toEqual(["NZD", "USD", "EUR", "GBP"]);
    expect(suggestedCurrencies([])).toEqual(["USD", "EUR", "GBP"]);
  });

  it("searches multilingual names and aliases with canonical ISO results", () => {
    expect(Object.keys(currencyNames).sort()).toEqual(SUPPORTED_CURRENCY_CODES);
    expect(searchCurrencies(" aud ")[0]).toBe("AUD");
    expect(searchCurrencies("Australia")).toContain("AUD");
    expect(searchCurrencies("澳元")).toContain("AUD");
    expect(searchCurrencies("纽币")).toContain("NZD");
    expect(searchCurrencies("yen")).toContain("JPY");
    expect(searchCurrencies("日元")).toContain("JPY");
    expect(searchCurrencies("RMB")).toContain("CNY");
    expect(searchCurrencies("no-such-currency")).toEqual([]);
    expect(searchCurrencies(" ").length).toBeGreaterThan(100);
    expect(currencyName("ISK", "zh-Hans")).toBe("冰岛克朗");
    expect(currencyName("ISK", "en")).toBe("Icelandic Króna");
  });
});
