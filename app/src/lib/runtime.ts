import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True when running inside the Expo Go sandbox rather than a custom dev
 * build. Features that need native modules (ML Kit liveness) or remote push
 * registration are unavailable there and must degrade gracefully.
 */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
