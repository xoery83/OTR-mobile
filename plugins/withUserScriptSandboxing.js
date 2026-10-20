const { withXcodeProject } = require("expo/config-plugins");

module.exports = function withUserScriptSandboxing(config) {
  return withXcodeProject(config, (configuredProject) => {
    const buildConfigurations =
      configuredProject.modResults.pbxXCBuildConfigurationSection();

    for (const buildConfiguration of Object.values(buildConfigurations)) {
      if (!buildConfiguration.buildSettings) continue;

      buildConfiguration.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = "NO";
    }

    return configuredProject;
  });
};
