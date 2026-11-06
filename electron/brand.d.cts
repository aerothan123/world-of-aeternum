export declare const PRODUCT_NAME: string;
export declare const DESKTOP_APP_ID: string;
export declare const DEEP_LINK_SCHEME: string;
export declare const PRODUCTION_API_ORIGIN: string;
export declare const LOCAL_DEV_API_ORIGIN: string;
export declare const LEGACY_USER_DATA_NAMES: readonly string[];
export declare function resolveUserDataDir(args: {
  current: string;
  appData: string;
  exists: (p: string) => boolean;
  join: (...parts: string[]) => string;
}): string;
