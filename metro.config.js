// Bundle the vendored H.264 encoder (a large .txt blob) as an asset so it can
// be read at runtime and injected into the WebView. Everything else is Expo's
// default Metro config.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('txt');

module.exports = config;
