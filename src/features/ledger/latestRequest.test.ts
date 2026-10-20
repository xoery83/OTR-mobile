import { describe, expect, it } from "vitest";

import { createLatestRequest } from "./latestRequest";

describe("latest financial projection request", () => {
  it("rejects an older response that arrives after the newest response", async () => {
    const latest = createLatestRequest();
    const commits: string[] = [];
    let finishOld!: (value: string) => void;
    let finishNew!: (value: string) => void;
    const run = async (result: Promise<string>) => {
      const request = latest.begin();
      const value = await result;
      if (latest.isCurrent(request)) commits.push(value);
    };
    const old = run(new Promise((resolve) => (finishOld = resolve)));
    const recent = run(new Promise((resolve) => (finishNew = resolve)));
    finishNew("new");
    await recent;
    finishOld("old");
    await old;
    expect(commits).toEqual(["new"]);
  });
});
