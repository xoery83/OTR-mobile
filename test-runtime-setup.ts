// Node tests need the React Native runtime constant before importing App modules.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
