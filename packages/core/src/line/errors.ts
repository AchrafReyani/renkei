/** Error returned by a LINE Platform HTTP API. */
export class LineApiError extends Error {
  override readonly name = 'LineApiError';
  constructor(
    /** Which endpoint failed, e.g. "token", "verify", "profile". */
    readonly endpoint: string,
    /** HTTP status code. */
    readonly status: number,
    /** OAuth-style `error` code when LINE provides one. */
    readonly code?: string,
    /** Human readable `error_description` when LINE provides one. */
    readonly description?: string,
  ) {
    super(
      `LINE ${endpoint} failed (${status})${code ? `: ${code}` : ''}${description ? ` - ${description}` : ''}`,
    );
  }
}

/** The authorization callback carried an OAuth error instead of a code. */
export class LineAuthorizationError extends Error {
  override readonly name = 'LineAuthorizationError';
  constructor(
    readonly code: string,
    readonly description?: string,
    readonly state?: string,
  ) {
    super(`LINE authorization failed: ${code}${description ? ` - ${description}` : ''}`);
  }
}

/** Something about the id_token was wrong. Wraps jose errors with context. */
export class LineIdTokenError extends Error {
  override readonly name = 'LineIdTokenError';
  constructor(
    readonly reason:
      | 'malformed'
      | 'unsupported_alg'
      | 'signature'
      | 'issuer'
      | 'audience'
      | 'expired'
      | 'nonce'
      | 'missing_sub',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** Parse a LINE error body (`{ error, error_description }` or `{ message }`) if present. */
export async function readLineError(endpoint: string, res: Response): Promise<LineApiError> {
  let code: string | undefined;
  let description: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: string;
      error_description?: string;
      message?: string;
    };
    code = body.error;
    description = body.error_description ?? body.message;
  } catch {
    // non-JSON error body; status alone is the signal
  }
  return new LineApiError(endpoint, res.status, code, description);
}
