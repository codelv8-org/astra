export interface AdapterCapabilities {
  structuredEvents: boolean;
  cancellation: boolean;
  resume: boolean;
  sandbox: "read-only" | "mock";
}
export interface AdapterContract {
  detect(): Promise<boolean>;
  getVersion(): Promise<string | null>;
  checkAuthentication(): Promise<
    "authenticated" | "unauthenticated" | "unknown" | "not_required"
  >;
  validateConfiguration(): Promise<void>;
  start(): Promise<string>;
  streamEvents(executionId: string): AsyncIterable<unknown>;
  requestCancellation(executionId: string): Promise<void>;
  getStatus(executionId: string): Promise<string>;
  getResult(executionId: string): Promise<unknown>;
  cleanup(executionId: string): Promise<void>;
  resume?: (sessionId: string) => Promise<string>;
}
