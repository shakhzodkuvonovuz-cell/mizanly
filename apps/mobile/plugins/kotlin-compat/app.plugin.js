const {
  withGradleProperties,
  withProjectBuildGradle,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * Expo config plugin to fix Kotlin/Compose version compatibility.
 * React Native 0.76 ships Kotlin 1.9.24 but expo-modules-core's
 * Compose Compiler 1.5.15 requires 1.9.25. This suppresses the check.
 */
function withKotlinCompat(config) {
  // 1. Add gradle.properties flag
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'kotlin.suppressKotlinVersionCompatibilityCheck')
    );
    cfg.modResults.push({
      type: 'property',
      key: 'kotlin.suppressKotlinVersionCompatibilityCheck',
      value: 'true',
    });
    return cfg;
  });

  // 2. Inject Compose compiler suppression INSIDE the existing allprojects block
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;

    let contents = cfg.modResults.contents;

    if (contents.includes('suppressKotlinVersionCompatibilityCheck=1.9.24')) return cfg;

    // Insert the KotlinCompile configuration inside the existing allprojects { repositories { } } block
    // by appending it right before the closing brace of allprojects
    const kotlinSnippet = `
    // [kotlin-compat] Suppress Compose Compiler version check
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        kotlinOptions {
            freeCompilerArgs += [
                "-P",
                "plugin:androidx.compose.compiler.plugins.kotlin:suppressKotlinVersionCompatibilityCheck=1.9.24"
            ]
        }
    }`;

    // Find the allprojects block and inject before its closing brace
    // Pattern: allprojects { ... repositories { ... } \n}
    const allProjectsClose = contents.lastIndexOf('\n}');
    if (allProjectsClose !== -1) {
      contents = contents.slice(0, allProjectsClose) + '\n' + kotlinSnippet + '\n' + contents.slice(allProjectsClose);
    }

    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(withKotlinCompat, 'mizanly-kotlin-compat', '1.0.0');
