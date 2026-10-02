// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Local caches (E2E binaries, Deno npm cache) must never be bundled or indexed.
config.resolver.blockList = [/\/\.cache\/.*/];

module.exports = config;
