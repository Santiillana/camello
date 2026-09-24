export {};

declare global {
  interface Window {
    __CAMELLO_TEST_SQL__?: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  }
}
