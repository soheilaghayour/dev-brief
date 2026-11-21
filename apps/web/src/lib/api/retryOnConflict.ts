import { ApiError } from './apiError';

// The account's write lock answers 409 CONFLICT while another request holds it.
const BACKOFF_MS = [250, 500];

export function isConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409;
}

/** Runs the request again, after a short wait, while the account's write lock is busy; any other error is thrown at once. */
export async function retryOnConflict<T>(request: () => Promise<T>): Promise<T> {
  for (const delay of BACKOFF_MS) {
    try {
      return await request();
    } catch (error) {
      if (!isConflict(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return request();
}
