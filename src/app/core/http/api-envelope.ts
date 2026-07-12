/** Response shape every endpoint on our API wraps its payload in, per the OpenAPI spec. */
export interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly message: string;
  readonly timestamp: string;
  readonly data: T;
}
