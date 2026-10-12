import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { choiceFocusKey as g2ChoiceFocusKey } from "@/features/day-feed/composition";
import { SheetHeader } from "@/components/SheetHeader";
import { AppIcon } from "@/components/AppIcon";
import { UiButton } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { formatUiDate } from "@/ui/locale";
import { visual } from "@/ui/visual";
import { segmentedControlTokens } from "@/ui/segmented";
import {
  reduceGallery,
  resizePreview,
  poolResources,
  straightLine,
  validCoordinates,
  choiceFocusKey,
  resourceSnapshot,
  type Resource,
  type GalleryState,
  type Action,
} from "./model";
import {
  baskets,
  fixtureOrigin,
  initialState,
  projectFixture,
  type Context,
  type FixtureId,
  type FlexibleFixtureProjection,
} from "./fixtures";
import { t } from "./copy";
import { Manipulation } from "./Manipulation";
const images = {
  garden: require("./images/garden-reference.png"),
  cafe: require("./images/cafe-reference.png"),
};
const clock = (minute: number) =>
  formatUiDate(new Date(Date.UTC(2026, 9, 12, 0, minute)), {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
export type FlexibleRendererProps = {
  shared?: {
    state: GalleryState;
    dispatch: (action: Action) => void;
    scope: "MY" | "GROUP";
    choices: readonly string[];
    group?: readonly string[];
    onScope: (scope: "MY" | "GROUP") => void;
    immersive: boolean;
    open: () => void;
    close: () => void;
  };
  fixture: FixtureId;
  context: Context;
  focusedId: string | null;
  onFocusIntent: (id: string | null) => void;
  onResourceDetailsIntent?: (resource: Resource) => void;
  onNavigateIntent?: (resource: Resource) => void;
  onMapIntent?: (resources: readonly Resource[]) => void;
  nestedItems?: ReactNode;
  timeRailLeft?: number;
  onProjectionChange?: (projection: FlexibleFixtureProjection) => void;
};
// G2 supplies Focus and authorized ordinary Item slots; this renderer owns no composer or clock.
export function FlexibleRenderer({
  shared,
  fixture,
  context,
  focusedId,
  onFocusIntent,
  onResourceDetailsIntent,
  onNavigateIntent,
  onMapIntent,
  nestedItems,
  timeRailLeft = 0,
  onProjectionChange,
}: FlexibleRendererProps) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { width, fontScale, height } = useWindowDimensions();
  const [localState, localDispatch] = useReducer(reduceGallery, fixture, initialState);
  const state = shared?.state ?? localState;
  const dispatch = shared?.dispatch ?? localDispatch;
  const [localScope, setLocalScope] = useState<"MY" | "GROUP">(
    state.my.length ? "MY" : "GROUP",
  );
  const scope = shared?.scope ?? localScope;
  const setScope = shared?.onScope ?? setLocalScope;
  const [localPanel, setPanel] = useState<
    "immersive" | "map" | "details" | "navigate" | "adjacent" | null
  >(null);
  const panel = shared?.immersive && localPanel === null ? "immersive" : localPanel;
  const [returnPanel, setReturnPanel] = useState<"immersive" | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [mode, setMode] = useState<"recommended" | "saved" | "search">("recommended");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [batch, setBatch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cancelKey, setCancelKey] = useState(0);
  const [railActive, setRailActive] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [editingEdge, setEditingEdge] = useState<"start" | "end" | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const myTarget = useRef<View>(null),
    [bounds, setBounds] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const measureMy = () =>
    myTarget.current?.measureInWindow((x, y, width, height) => {
      setBounds({ x, y, width, height });
    });
  const inMy = (x: number, y: number) => {
    const b = bounds;
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  };
  const canEdit = fixture !== "f14";
  const origin = fixture === "f14" ? undefined : fixtureOrigin;
  const group =
    shared?.group ?? (["f01", "f09"].includes(fixture) ? [] : baskets[0].resources);
  const choices = shared?.choices ?? (scope === "MY" ? state.my : group);
  useEffect(() => {
    if (!shared) onProjectionChange?.(projectFixture(state, fixture, scope));
  }, [state, fixture, scope, onProjectionChange, shared]);
  const selected = state.resources.find((r) => r.id === resourceId);
  const close = () => {
    setCancelKey((k) => k + 1);
    setBusy(false);
    setPreview(null);
    setEditingEdge(null);
    if (panel === "details" || panel === "navigate") setPanel(returnPanel);
    else setPanel(null);
  };
  const splitter = useMemo(
    () =>
      PanResponder.create({
        // Own this divider touch before the nested ScrollViews claim it.
        onStartShouldSetPanResponderCapture: () => true,
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dy) > 24 && Math.abs(g.dy) > Math.abs(g.dx))
            setExpanded(g.dy < 0);
          else if (Math.hypot(g.dx, g.dy) < 10) setExpanded((value) => !value);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );
  const action = (label: string, onPress: () => void, disabled = false) => (
    <UiButton label={label} variant="text" onPress={onPress} disabled={disabled} />
  );
  const thumbnail = (r: Resource) =>
    failedImages.includes(r.id) ? (
      <Text style={styles.meta}>{t("noImage")}</Text>
    ) : (
      <Image
        source={images[r.image!]}
        onError={() =>
          setFailedImages((ids) => (ids.includes(r.id) ? ids : [...ids, r.id]))
        }
        style={styles.thumbnail}
        accessibilityLabel={t("reference")}
      />
    );
  const resource = (id: string, place: string, compact = false, owned = false) => {
    const r = state.resources.find((r) => r.id === id);
    if (!r) return null;
    const blockId = state.block?.id ?? `fixture-flexible-${fixture}`;
    const key =
        shared && place === "browse"
          ? g2ChoiceFocusKey(blockId, scope, id)
          : choiceFocusKey(blockId, place, id),
      focused = focusedId === key;
    const meters = context === "today" ? straightLine(origin, r.coordinates) : null;
    const dragDisabled = context === "past" || place === "browse" || place === "history";
    return (
      <View key={key} testID={key} style={[styles.resource, focused && styles.focus]}>
        <Manipulation
          cancelKey={cancelKey}
          label={r.name}
          hint={dragDisabled ? undefined : t(owned ? "removeDrag" : "drag")}
          dragDisabled={dragDisabled}
          onTap={() => onFocusIntent(focused ? null : key)}
          onArm={measureMy}
          onBusy={setBusy}
          onDrop={(_, g) => {
            if (place === "browse" || context === "past") return;
            if (owned ? !inMy(g.moveX, g.moveY) : inMy(g.moveX, g.moveY)) {
              dispatch({ type: owned ? "remove" : "add", id });
              onFocusIntent(null);
            }
          }}
        >
          <View style={!compact ? styles.resourceLine : undefined}>
            {r.image && (!compact || focused) ? thumbnail(r) : null}
            <View style={styles.resourceCopy}>
              <Text style={styles.title}>{r.name}</Text>
              {!compact || focused ? (
                <Text style={styles.meta}>
                  {[r.category, r.location].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>
        </Manipulation>
        {focused ? (
          <View testID="choice-focus" style={styles.focusBody}>
            {meters !== null ? (
              <Text style={styles.meta}>{t("straight", { meters })}</Text>
            ) : null}
            {context === "today" && validCoordinates(r.coordinates)
              ? action(t("navigate"), () => {
                  if (onNavigateIntent) {
                    onNavigateIntent(resourceSnapshot(r));
                    return;
                  }
                  setResourceId(id);
                  setReturnPanel(panel === "immersive" ? "immersive" : null);
                  setPanel("navigate");
                })
              : null}
            {action(t("details"), () => {
              if (onResourceDetailsIntent) {
                onResourceDetailsIntent(resourceSnapshot(r));
                return;
              }
              setResourceId(id);
              setReturnPanel(panel === "immersive" ? "immersive" : null);
              setPanel("details");
            })}
            {context !== "past" && place !== "browse" ? (
              <>
                {action(t(state.saved.includes(id) ? "unheart" : "heart"), () =>
                  dispatch({ type: "heart", id }),
                )}
                {action(
                  t(owned ? "remove" : "add"),
                  () => dispatch({ type: owned ? "remove" : "add", id }),
                  !owned && state.my.includes(id),
                )}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };
  const edge = (side: "start" | "end") =>
    state.block && canEdit && context !== "past" ? (
      <View>
        <Manipulation
          cancelKey={cancelKey}
          label={t(side)}
          hint={t("resizeHint")}
          onBusy={setBusy}
          onArm={() => setEditingEdge(side)}
          onTap={() => setEditingEdge(editingEdge === side ? null : side)}
          onMove={(_, g) => {
            setRailActive(g.moveX - timeRailLeft >= 0 && g.moveX - timeRailLeft <= 44);
            setPreview(resizePreview(state.block!, side, g.dy, g.moveX - timeRailLeft));
          }}
          onDrop={(_, g) => {
            const snap = resizePreview(state.block!, side, g.dy, g.moveX - timeRailLeft);
            if (snap !== null) dispatch({ type: "resize", edge: side, minute: snap });
          }}
          onCancel={() => {
            setPreview(null);
            setRailActive(false);
          }}
        >
          <View style={styles.handle}>
            <View style={styles.handleLine} />
          </View>
        </Manipulation>
        {editingEdge === side && !busy ? (
          <View style={styles.wrap}>
            {action(t("earlier"), () =>
              dispatch({ type: "resize", edge: side, minute: state.block![side] - 15 }),
            )}
            {action(t("later"), () =>
              dispatch({ type: "resize", edge: side, minute: state.block![side] + 15 }),
            )}
            {action(t("cancel"), () => {
              setEditingEdge(null);
              setPreview(null);
            })}
          </View>
        ) : null}
      </View>
    ) : null;
  const selectedPins = choices
    .map((id) => state.resources.find((r) => r.id === id))
    .filter((r): r is Resource => !!r && validCoordinates(r.coordinates));
  const header = state.block ? (
    <View style={styles.blockHeader}>
      <Pressable
        style={styles.headerTap}
        accessibilityRole="button"
        accessibilityLabel={state.block.title || t("afternoon")}
        onPress={() => (shared ? shared.open() : setPanel("immersive"))}
      >
        <Text style={styles.heading}>{state.block.title || t("afternoon")}</Text>
        <View style={styles.wrap}>
          <AppIcon name="clock" color={colors.textSecondary} size={14} />
          <Text
            style={styles.meta}
          >{`${clock(state.block.start)} – ${clock(state.block.end)}`}</Text>
          {state.block.area ? (
            <>
              <AppIcon name="mappin" color={colors.textSecondary} size={14} />
              <Text style={styles.meta}>{state.block.area}</Text>
            </>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.iconTarget}
        accessibilityRole="button"
        accessibilityLabel={t("map")}
        onPress={() => {
          if (onMapIntent) onMapIntent(Object.freeze(selectedPins.map(resourceSnapshot)));
          else setPanel("map");
        }}
      >
        <AppIcon name="map" color={colors.textSecondary} />
      </Pressable>
    </View>
  ) : null;
  const openBlock = () => (shared ? shared.open() : setPanel("immersive"));
  const history = (
    <View style={styles.history}>
      <Text style={styles.heading}>{t("memory")}</Text>
      <Text style={styles.meta}>{t("noVisit")}</Text>
      {(shared
        ? choices.map((id) => ({ id }))
        : projectFixture(state, fixture, scope).choices
      ).map(({ id }) => {
        const hasEvidence = fixture !== "f11" && id === "garden";
        return (
          <View key={id} style={styles.resource}>
            {resource(id, "history", false)}
            {!hasEvidence ? <Text style={styles.meta}>{t("noEvidence")}</Text> : null}
            {hasEvidence ? (
              <>
                <Image
                  source={images.garden}
                  style={styles.memoryImage}
                  accessibilityLabel={t("photo")}
                />
                <Text style={styles.meta}>{t("photo")}</Text>
                <Text style={styles.meta}>{t("expense")}</Text>
              </>
            ) : null}
          </View>
        );
      })}
      {!choices.length ? <Text style={styles.meta}>{t("noEvidence")}</Text> : null}
      {/* Ordinary Item history remains in the G2-owned Item surface. */}
    </View>
  );
  const carouselBaskets = [...projectFixture(state, fixture, scope).published];
  if (carouselBaskets.length > 1)
    [carouselBaskets[0], carouselBaskets[1]] = [carouselBaskets[1], carouselBaskets[0]];
  const cardHeight = Math.max(160, height * 0.24);
  const list = poolResources(state, mode, query, batch);
  const planning = (
    <ScrollView
      style={styles.modalRoot}
      contentContainerStyle={styles.workspace}
      scrollEnabled={!busy}
      nestedScrollEnabled
      stickyHeaderIndices={expanded ? [1] : []}
    >
      {canEdit ? (
        <UiTextInput
          accessibilityLabel={t("title")}
          placeholder={state.block?.title || t("afternoon")}
          value={draftTitle}
          onChangeText={setDraftTitle}
          onEndEditing={() => {
            if (draftTitle.trim()) dispatch({ type: "title", value: draftTitle });
          }}
        />
      ) : (
        <Text style={styles.meta}>{t("permission")}</Text>
      )}
      <View style={[styles.baskets, { height: expanded ? undefined : cardHeight + 48 }]}>
        <View
          ref={myTarget}
          collapsable={false}
          onLayout={measureMy}
          style={[styles.my, { flex: width < 375 || fontScale > 1.3 ? 0.5 : 0.4 }]}
          testID="my-drop-target"
        >
          <Text style={styles.heading}>{t("my", { count: state.my.length })}</Text>
          {!expanded ? (
            <ScrollView scrollEnabled={!busy} nestedScrollEnabled>
              {state.my.map((id) => resource(id, "my", true, true))}
              {!state.my.length ? <Text style={styles.meta}>{t("empty")}</Text> : null}
            </ScrollView>
          ) : null}
        </View>
        <View
          style={[styles.published, { flex: width < 375 || fontScale > 1.3 ? 0.5 : 0.6 }]}
          testID="published-carousel"
        >
          {expanded ? (
            <Text style={styles.heading}>{t("group", { count: group.length })}</Text>
          ) : (
            <ScrollView
              scrollEnabled={!busy}
              nestedScrollEnabled
              contentContainerStyle={styles.carousel}
              decelerationRate="fast"
              snapToInterval={cardHeight + visual.space.card}
              contentOffset={{
                x: 0,
                y: carouselBaskets.length > 1 ? cardHeight + visual.space.card - 24 : 0,
              }}
            >
              {carouselBaskets.map((b) => (
                <View key={b.id} style={[styles.basketCard, { height: cardHeight }]}>
                  <Text style={styles.heading}>
                    {b.id === "group" ? t("group", { count: group.length }) : b.name}
                  </Text>
                  <ScrollView scrollEnabled={!busy} nestedScrollEnabled>
                    {b.resources.map((id) => resource(id, b.id, true))}
                  </ScrollView>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
      <View {...splitter.panHandlers} style={styles.divider}>
        {action(t(expanded ? "collapse" : "expand"), () => {
          setExpanded((v) => !v);
          onFocusIntent(null);
        })}
      </View>
      <View style={[styles.wrap, styles.modeBar]}>
        {(["recommended", "saved", "search"] as const).map((value) => (
          <UiButton
            key={value}
            label={t(value, value === "saved" ? { count: state.saved.length } : {})}
            variant={mode === value ? "secondary" : "text"}
            onPress={() => {
              setMode(value);
              onFocusIntent(null);
            }}
          />
        ))}
      </View>
      {mode === "search" ? (
        <UiTextInput
          accessibilityLabel={t("searchHint")}
          placeholder={t("searchHint")}
          value={query}
          onChangeText={setQuery}
        />
      ) : mode === "recommended" ? (
        action(t("refresh"), () => {
          setBatch((v) => v + 1);
          onFocusIntent(null);
        })
      ) : (
        <Text style={styles.meta}>{t("relevant")}</Text>
      )}
      <ScrollView
        testID="pool-list"
        scrollEnabled={!busy}
        nestedScrollEnabled
        style={[styles.pool, { maxHeight: expanded ? height * 0.65 : height * 0.35 }]}
        contentContainerStyle={styles.poolContent}
      >
        {list.map((r, i) => (
          <View key={r.id}>
            {mode === "saved" && !r.relevant && (i === 0 || list[i - 1].relevant) ? (
              <Text style={styles.meta}>{t("other")}</Text>
            ) : null}
            {resource(r.id, "pool")}
          </View>
        ))}
        {mode === "search" && !list.length ? (
          <>
            <Text style={styles.meta}>{t("emptySearch")}</Text>
            {action(
              t("custom"),
              () => dispatch({ type: "custom", name: query }),
              !query.trim() || query.trim().length > 200,
            )}
          </>
        ) : null}
      </ScrollView>
      {fixture === "f14" && state.my.length ? (
        <View style={styles.wrap}>
          {(["pending", "failed", "accepted"] as const).map((outcome) =>
            action(
              t(
                outcome === "failed"
                  ? "failure"
                  : outcome === "accepted"
                    ? "accept"
                    : "pending",
              ),
              () => dispatch({ type: "promotion", id: state.my[0], outcome }),
            ),
          )}
          <Text style={styles.meta}>
            {t(
              state.promotion === "pending"
                ? "promotionPending"
                : state.promotion === "failed"
                  ? "promotionFailed"
                  : state.promotion === "accepted"
                    ? "promotionAccepted"
                    : "idle",
            )}
          </Text>
        </View>
      ) : null}
      {canEdit
        ? action(t("delete"), () => {
            dispatch({ type: "delete" });
            if (!shared) setPanel(null);
          })
        : null}
    </ScrollView>
  );
  return (
    <View style={styles.root}>
      <View testID="flexible-component" style={styles.feed}>
        {(!shared || !shared.immersive) && state.block ? (
          <View testID="flexible-block" style={styles.block}>
            {edge("start")}
            {header}
            {nestedItems}
            {state.my.length && group.length ? (
              <View style={styles.wrap}>
                {action(t("my", { count: state.my.length }), () => {
                  setScope("MY");
                  if (!shared) onFocusIntent(null);
                })}
                {action(t("group", { count: group.length }), () => {
                  setScope("GROUP");
                  if (!shared) onFocusIntent(null);
                })}
              </View>
            ) : null}
            {choices.length ? (
              <View style={styles.grid}>
                {Array.from({ length: Math.ceil(choices.length / 2) }, (_, i) => (
                  <View key={i} style={styles.gridRow}>
                    {choices.slice(i * 2, i * 2 + 2).map((id) => (
                      <View key={id} testID="choice-column" style={styles.column}>
                        {resource(id, "browse", true)}
                      </View>
                    ))}
                    {i * 2 + 1 >= choices.length ? <View style={styles.column} /> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.meta}>
                {t(context === "past" ? "noEvidence" : "empty")}
              </Text>
            )}
            {!choices.length && context !== "past" ? action(t("plan"), openBlock) : null}
            {edge("end")}
            {railActive ? (
              <View pointerEvents="none" testID="temporal-ruler" style={styles.ruler}>
                {[state.block.start, state.block.start + 15, state.block.start + 30].map(
                  (minute) => (
                    <Text key={minute} style={styles.meta}>
                      {clock(minute)}
                    </Text>
                  ),
                )}
                <Text style={styles.meta}>
                  {preview === null ? t("cancel") : t("snap", { time: clock(preview) })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : !shared && canEdit && context !== "past" ? (
          action(t("create"), () => {
            dispatch({ type: "create" });
            setScope("GROUP");
          })
        ) : null}
        {!shared && fixture === "f13" ? (
          <View style={styles.block} testID="adjacent-block">
            <Pressable
              style={styles.headerTap}
              accessibilityRole="button"
              accessibilityLabel={t("afternoon")}
              onPress={() => setPanel("adjacent")}
            >
              <Text style={styles.heading}>{t("afternoon")}</Text>
              <Text style={styles.meta}>{`${clock(1110)} – ${clock(1200)}`}</Text>
            </Pressable>
            <Text style={styles.meta}>{t("empty")}</Text>
          </View>
        ) : null}
        {busy
          ? action(t("cancel"), () => {
              setCancelKey((k) => k + 1);
              setBusy(false);
              setPreview(null);
              setEditingEdge(null);
            })
          : null}
        {state.undo ? action(t("undo"), () => dispatch({ type: "undo" })) : null}
      </View>
      {shared?.immersive ? (
        <>
          {header}
          {nestedItems}
          {context === "past" ? history : planning}
          {action(t("close"), shared.close)}
        </>
      ) : null}
      <Modal
        visible={panel !== null && (!shared || panel !== "immersive")}
        onRequestClose={close}
        animationType="slide"
      >
        <SafeAreaView edges={["bottom"]} style={styles.modalRoot}>
          <SheetHeader
            title={t(
              panel === "map"
                ? "map"
                : panel === "details"
                  ? "resource"
                  : panel === "navigate"
                    ? "navigation"
                    : "afternoon",
            )}
            onLeft={close}
          />
          {panel === "immersive" ? (
            context === "past" ? (
              <ScrollView style={styles.modalRoot}>{history}</ScrollView>
            ) : (
              planning
            )
          ) : (
            <ScrollView style={styles.modalRoot} contentContainerStyle={styles.feed}>
              {panel === "map" ? (
                <>
                  <Text style={styles.heading}>{t("mapFixture")}</Text>
                  <View style={styles.mapSurface}>
                    {selectedPins.map((r, i) => (
                      <View
                        key={r.id}
                        style={[
                          styles.pin,
                          { alignSelf: i % 2 ? "flex-end" : "flex-start" },
                        ]}
                      >
                        <AppIcon name="mappin.circle.fill" color={colors.accent} />
                        <Text style={styles.title}>{r.name}</Text>
                        <Text
                          style={styles.meta}
                        >{`${r.coordinates!.latitude}, ${r.coordinates!.longitude}`}</Text>
                      </View>
                    ))}
                  </View>
                  {!selectedPins.length ? (
                    <Text style={styles.meta}>{t("noPins")}</Text>
                  ) : null}
                </>
              ) : null}
              {(panel === "details" || panel === "navigate") && selected ? (
                <>
                  <Text style={styles.heading}>{selected.name}</Text>
                  {selected.image ? (
                    thumbnail(selected)
                  ) : (
                    <Text style={styles.meta}>{t("noImage")}</Text>
                  )}
                  <Text style={styles.meta}>
                    {[selected.category, selected.location].filter(Boolean).join(" · ") ||
                      t("missing")}
                  </Text>
                  {selected.id.startsWith("custom-") ? (
                    <Text style={styles.meta}>{t("unverified")}</Text>
                  ) : null}
                  {panel === "navigate" ? (
                    <>
                      <Text style={styles.meta}>{t("navigationHint")}</Text>
                      <Text style={styles.meta}>
                        {selected.coordinates
                          ? `${selected.coordinates.latitude}, ${selected.coordinates.longitude}`
                          : t("missing")}
                      </Text>
                    </>
                  ) : null}
                </>
              ) : null}
              {panel === "adjacent" ? (
                <Text style={styles.meta}>{t("empty")}</Text>
              ) : null}
            </ScrollView>
          )}
          {busy
            ? action(t("cancel"), () => {
                setCancelKey((k) => k + 1);
                setBusy(false);
              })
            : null}
          {state.undo ? action(t("undo"), () => dispatch({ type: "undo" })) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { backgroundColor: c.background },
    modalRoot: { flex: 1, backgroundColor: c.background },
    feed: { padding: visual.space.page, gap: visual.space.section },
    block: {
      width: "100%",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    blockHeader: { flexDirection: "row", alignItems: "flex-start" },
    headerTap: {
      flex: 1,
      minHeight: 44,
      paddingVertical: visual.space.heading,
      gap: visual.space.heading,
    },
    heading: { ...visual.type.section, color: c.textPrimary },
    title: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    wrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: visual.space.heading,
    },
    iconTarget: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    grid: { gap: visual.space.heading },
    gridRow: { flexDirection: "row", alignItems: "stretch", gap: visual.space.card },
    column: { flex: 1, minWidth: 0 },
    resource: {
      padding: visual.space.heading,
      gap: visual.space.heading,
      borderWidth: 1,
      borderColor: c.background,
      borderRadius: visual.radius.control,
    },
    focus: { borderColor: c.separator },
    resourceLine: {
      flexDirection: "row",
      gap: visual.space.card,
      alignItems: "flex-start",
    },
    resourceCopy: { flex: 1, minWidth: 0, gap: visual.space.heading },
    thumbnail: {
      width: 64,
      height: 48,
      borderRadius: visual.radius.control,
      marginBottom: visual.space.heading,
    },
    focusBody: { gap: visual.space.heading },
    workspace: {
      flexGrow: 1,
      paddingHorizontal: visual.space.page,
      gap: visual.space.heading,
    },
    baskets: { flexDirection: "row", gap: visual.space.card },
    my: { minWidth: 0, gap: visual.space.heading, backgroundColor: c.background },
    published: { flex: 0.6, minWidth: 0 },
    carousel: { gap: visual.space.card },
    basketCard: {
      backgroundColor: c.surface,
      padding: visual.space.heading,
      borderRadius: visual.radius.card,
      gap: visual.space.heading,
    },
    divider: {
      minHeight: 44,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    modeBar: {
      backgroundColor: segmentedControlTokens(c).trackSurface,
      borderRadius: visual.radius.control,
    },
    pool: { minHeight: 160 },
    poolContent: { paddingBottom: visual.space.section },
    handle: { height: 44, justifyContent: "center", alignItems: "center" },
    handleLine: {
      width: 40,
      height: 3,
      borderRadius: visual.radius.pill,
      backgroundColor: c.separator,
    },
    ruler: {
      position: "absolute",
      top: 0,
      left: 0,
      width: 44,
      gap: visual.space.card,
      padding: 2,
      backgroundColor: c.selected,
    },
    history: { padding: visual.space.page, gap: visual.space.card },
    memoryImage: { width: "100%", height: 160, borderRadius: visual.radius.control },
    mapSurface: {
      minHeight: 280,
      backgroundColor: c.surface,
      padding: visual.space.card,
      gap: visual.space.section,
      borderRadius: visual.radius.card,
    },
    pin: { maxWidth: "85%", gap: visual.space.heading },
  });
