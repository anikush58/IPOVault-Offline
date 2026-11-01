const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// Direct react-native-google-mobile-ads to compiled distribution instead of raw TypeScript source
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-google-mobile-ads') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-native-google-mobile-ads/lib/module/index.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'expo-application') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/expo-application/build/Application.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'expo-blur' && platform === 'android') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/expo-blur/build/BlurView.android.js'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
