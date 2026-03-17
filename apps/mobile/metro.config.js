const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Only watch the specific directories we need, NOT the entire monorepo root
// (which includes .worktrees with huge node_modules)
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Let Metro know where to resolve packages from (monorepo root + mobile)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Block worktrees and other apps from being crawled
config.resolver.blockList = [
  /\.worktrees\/.*/,
  /apps\/api\/.*/,
];

// Web platform support — ensure .web.tsx/.web.ts extensions resolve first on web
config.resolver.sourceExts = [
  ...(config.resolver.sourceExts || []),
  'mjs', // Some web-only ESM packages use .mjs
];

// Resolve platform-specific extensions (.web.tsx before .tsx)
config.resolver.resolverMainFields = ['browser', 'main'];

module.exports = config;
