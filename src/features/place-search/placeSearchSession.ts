import {
  normalizePlaceQuery,
  type ApplePlaceCandidate,
  type ApplePlaceQuery,
  type createApplePlaceProvider,
} from "@/data/places/applePlaceProvider";
export type PlaceProvider = ReturnType<typeof createApplePlaceProvider>;
export type PlaceSearchState = Readonly<{
  status: "IDLE" | "LOADING" | "READY" | "EMPTY" | "ERROR";
  rows: readonly ApplePlaceCandidate[];
  more: boolean;
  error?: string;
}>;
const empty: PlaceSearchState = { status: "IDLE", rows: [], more: false };

// P1 subset of frozen Lab relaxQuery: generic trailing intent only; never rewrite authored fields.
const generic = new Set([
  "the",
  "a",
  "an",
  "at",
  "in",
  "of",
  "and",
  "with",
  "near",
  "nearby",
  "location",
  "address",
  "pickup",
  "pick-up",
  "hotel",
  "restaurant",
  "station",
  "park",
  "tour",
  "tours",
  "walking",
  "hiking",
  "guided",
  "city",
  "day",
  "trip",
  "dinner",
  "friends",
  "airport",
  "terminal",
  "museum",
  "hut",
  "water",
  "taxi",
  "central",
  "main",
  "international",
  "train",
  "bus",
  "railway",
  "national",
  "local",
  "north",
  "south",
  "east",
  "west",
  "adventure",
  "food",
  "history",
]);
export function relaxedPlaceQuery(query: ApplePlaceQuery) {
  const normalized = normalizePlaceQuery(query.text),
    words = normalized.phrase.split(" ");
  const tail = normalized.tokens.at(-1);
  if (
    words.length < 2 ||
    !tail ||
    ![
      "pickup",
      "pick-up",
      "nearby",
      "location",
      "address",
      ...(query.region ? ["tour"] : []),
    ].includes(tail)
  )
    return null;
  const phrase = words.slice(0, -1).join(" ").trim();
  const distinct = normalizePlaceQuery(phrase).tokens.filter(
    (token) => !generic.has(token),
  );
  if (
    !distinct.length ||
    distinct.every((token) => token.length < 4) ||
    distinct.some((token) => /[\u3400-\u9fff]/u.test(token))
  )
    return null;
  return phrase;
}
export class PlaceSearchSession {
  state: PlaceSearchState = empty;
  private sequence = 0;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private quick: PlaceSearchState = empty;
  private extended?: readonly ApplePlaceCandidate[];
  private query: ApplePlaceQuery = { text: "" };
  private key: string | null = null;
  private closed = false;
  constructor(
    private readonly provider: PlaceProvider,
    private readonly moreProvider: PlaceProvider,
    private readonly changed: (state: PlaceSearchState) => void,
  ) {}
  private publish(state: PlaceSearchState) {
    if (!this.closed) {
      this.state = state;
      this.changed(state);
    }
  }
  private cancelPending() {
    this.sequence++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.provider.cancel();
    this.moreProvider.cancel();
  }
  update(query: ApplePlaceQuery, delay = 450, online = true) {
    if (this.closed) return;
    const key = JSON.stringify([
      normalizePlaceQuery(query.text).comparison,
      query.region ?? null,
      query.locale ?? null,
      query.intent ?? null,
      online,
    ]);
    if (key === this.key) {
      this.query = query;
      return;
    }
    this.key = key;
    this.cancelPending();
    this.query = query;
    this.extended = undefined;
    this.quick = empty;
    if (!online) {
      this.publish({ status: "ERROR", rows: [], more: false, error: "OFFLINE" });
      return;
    }
    if (normalizePlaceQuery(query.text).phrase.length < 2) {
      this.publish(empty);
      return;
    }
    const sequence = this.sequence;
    this.publish({ status: "LOADING", rows: [], more: false });
    this.timer = setTimeout(() => {
      void this.complete(sequence);
    }, delay);
  }
  private async complete(sequence: number) {
    const controller = new AbortController();
    this.controller = controller;
    const current = () =>
      !this.closed && sequence === this.sequence && !controller.signal.aborted;
    try {
      let rows = await this.provider.complete(this.query, controller.signal);
      if (!current()) return;
      const relaxed = relaxedPlaceQuery(this.query);
      if (!rows.length && relaxed) {
        rows = await this.provider.complete(
          { ...this.query, text: relaxed },
          controller.signal,
        );
        if (!current()) return;
      }
      this.quick = {
        status: rows.length ? "READY" : "EMPTY",
        rows: rows.slice(0, 5),
        more: false,
      };
      this.publish(this.quick);
    } catch (error) {
      if (current())
        this.publish({
          status: "ERROR",
          rows: [],
          more: false,
          error: error instanceof Error ? error.message : "ERROR",
        });
    }
  }
  async searchMore() {
    if (
      this.closed ||
      this.state.status === "LOADING" ||
      this.state.error === "OFFLINE" ||
      normalizePlaceQuery(this.query.text).phrase.length < 2
    )
      return;
    if (this.extended) {
      this.publish({
        status: this.extended.length ? "READY" : "EMPTY",
        rows: this.extended,
        more: true,
      });
      return;
    }
    this.sequence++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.moreProvider.cancel();
    const sequence = this.sequence,
      controller = new AbortController();
    this.controller = controller;
    this.publish({ status: "LOADING", rows: [], more: true });
    try {
      const rows = (await this.moreProvider.search(this.query, controller.signal)).slice(
        0,
        20,
      );
      if (this.closed || sequence !== this.sequence || controller.signal.aborted) return;
      const seen = new Set<string>();
      this.extended = [...this.quick.rows, ...rows]
        .filter((row) => {
          const key = JSON.stringify([
            row.title.trim().toLocaleLowerCase(),
            row.secondary.trim().toLocaleLowerCase(),
          ]);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 20);
      this.publish({
        status: this.extended.length ? "READY" : "EMPTY",
        rows: this.extended,
        more: true,
      });
    } catch (error) {
      if (!this.closed && sequence === this.sequence && !controller.signal.aborted)
        this.publish({
          status: "ERROR",
          rows: [],
          more: true,
          error: error instanceof Error ? error.message : "ERROR",
        });
    }
  }
  backToQuick() {
    this.sequence++;
    this.controller?.abort();
    this.moreProvider.cancel();
    this.publish(this.quick);
  }
  async resolve(candidate: ApplePlaceCandidate) {
    if (
      this.closed ||
      this.state.status === "LOADING" ||
      !this.state.rows.includes(candidate)
    )
      return null;
    this.controller?.abort();
    const sequence = ++this.sequence,
      controller = new AbortController();
    this.controller = controller;
    this.publish({ ...this.state, status: "LOADING" });
    try {
      const resolved =
        candidate.kind === "mapItem"
          ? candidate
          : await (
              this.quick.rows.includes(candidate) ? this.provider : this.moreProvider
            ).resolve(candidate, this.query, controller.signal);
      if (this.closed || sequence !== this.sequence || controller.signal.aborted)
        return null;
      this.publish({ ...this.state, status: "READY" });
      return resolved;
    } catch (error) {
      if (!this.closed && sequence === this.sequence && !controller.signal.aborted)
        this.publish({
          ...this.state,
          status: "ERROR",
          error: error instanceof Error ? error.message : "ERROR",
        });
      return null;
    }
  }
  close() {
    this.cancelPending();
    this.closed = true;
    this.provider.close();
    this.moreProvider.close();
  }
}
