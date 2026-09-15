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

module.exports = config;
