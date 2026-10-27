const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (process.env.OTR_DISABLE_LEDGER_PROTOTYPE === "1") {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.includes("ledger-prototype")) {
      throw new Error(`Prototype-disabled build rejected ${moduleName}.`);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

if (process.env.EXPO_PUBLIC_OTR_IMPORT_WORKBENCH === "1") {
  config.cacheVersion = "otr-import-workbench-v1";
}

// Shared node_modules must not reuse a different checkout's Expo Router context.
config.cacheVersion = `${config.cacheVersion ?? "expo"}:${__dirname}`;

if (process.env.OTR_FORMS_QA_EMBEDDED === "1") {
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) => {
    const result = resolve
      ? resolve(context, name, platform)
      : context.resolveRequest(context, name, platform);
    // Expo's DEV socket requires a server; this dedicated bundle is deliberately embedded.
    if (
      result.type === "sourceFile" &&
      /\/expo\/src\/async-require\/messageSocket\.native\.[jt]s$/.test(result.filePath)
    )
      return { type: "empty" };
    return result;
  };
  config.cacheVersion += ":embedded-forms-qa";
}

module.exports = config;
