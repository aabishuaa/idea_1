module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets-core powers the vision-camera frame processors
    // used by the liveness challenge. Must be last.
    plugins: [['react-native-worklets-core/plugin']],
  };
};
