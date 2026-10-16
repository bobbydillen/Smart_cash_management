/**
 * Every server action returns either a failure ({ error }) or a success object.
 * Success objects carry `error: undefined`, so callers can simply write
 * `if (res.error) ...` and then use the data on the other branch.
 */
export type Failure = { error: string }

export const fail = (error: string): Failure => ({ error })

export const ok = <T extends object = object>(data?: T) =>
  ({ error: undefined, success: true as const, ...(data as T) })
