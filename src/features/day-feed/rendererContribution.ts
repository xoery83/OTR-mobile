import { createElement, type ReactNode } from "react";
import type { DayQuery } from "@/domain/trip/dayReadModel";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import type { composeDayStream } from "./composition";
import type { Depth } from "./presentation";

export type DayFeedQuery = DayQuery & { coreRows?: readonly CoreDayRow[] };
type Stream = ReturnType<typeof composeDayStream>;
export type DayRowRendererProps = {
  row: Stream["rows"][number];
  container: Stream["containers"][number] | undefined;
  context?: Stream["context"];
  depth: Depth;
  onDepth: (depth: Depth) => void;
  withinMarker?: ReactNode;
  nextFocused?: boolean;
};
export type DayRowRenderer = (props: DayRowRendererProps) => ReactNode | null;
export type RendererContribution<T> = Readonly<{
  version: "day-feed-renderer/1";
  family: "P3" | "P4" | "P5" | "P6";
  facts: Readonly<Record<string, T>>;
  render: (props: DayRowRendererProps & { facts: T }) => ReactNode | null;
}>;
export function bindRenderer<T>(contribution: RendererContribution<T>): DayRowRenderer {
  if (contribution.version !== "day-feed-renderer/1")
    throw new Error("DAY_RENDERER_VERSION");
  return function BoundRenderer(props) {
    const id = props.row.item.event.id;
    if (!Object.hasOwn(contribution.facts, id)) return null;
    if (props.row.coreRowKeys.some((key) => key.itemId !== id)) return null;
    return createElement(contribution.render, {
      ...props,
      facts: contribution.facts[id],
    });
  };
}
