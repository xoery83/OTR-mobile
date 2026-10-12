import type { openTtrLabSelectionRepository } from "./ttrLabSelectionRepository";

type Loader = NonNullable<Parameters<typeof openTtrLabSelectionRepository>[1]>;

/** DEV acceptance seam: inject one write failure inside the owned native transaction. */
export function loadTtrLabTestDriver(consumeFailure: () => boolean): Loader {
  return async () => {
    if (typeof __DEV__ === "undefined" || __DEV__ !== true)
      throw new Error("G2_TEST_DRIVER_DEV_ONLY");
    const driver = await import("expo-sqlite");
    return {
      openDatabaseAsync: async (name, options) => {
        const db = await driver.openDatabaseAsync(name, options);
        return new Proxy(db, {
          get(target, property) {
            if (property === "runAsync")
              return (...args: unknown[]) => {
                if (
                  typeof args[0] === "string" &&
                  /^INSERT INTO ttr_selections/.test(args[0]) &&
                  consumeFailure()
                )
                  throw new Error("G2_LAB_INJECTED_WRITE_FAILURE");
                return Reflect.apply(target.runAsync, target, args);
              };
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    };
  };
}
