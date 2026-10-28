const { withAppDelegate } = require("expo/config-plugins");

module.exports = function withFormsQaEmbeddedBundle(config) {
  return withAppDelegate(config, (mod) => {
    const source = mod.modResults.contents;
    if (source.includes('object(forInfoDictionaryKey: "OTRFormsQAEmbeddedBundle")'))
      return mod;
    const anchor = "#if DEBUG\n    return RCTBundleURLProvider";
    if (mod.modResults.language !== "swift" || !source.includes(anchor))
      throw new Error("Forms QA embedded bundle: unsupported AppDelegate template");
    mod.modResults.contents = source.replace(
      anchor,
      `#if DEBUG
    // Dedicated device QA keeps DEV previews without sharing a Metro server.
    if Bundle.main.object(forInfoDictionaryKey: "OTRFormsQAEmbeddedBundle") as? Bool == true {
      return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    }
    return RCTBundleURLProvider`,
    );
    return mod;
  });
};
