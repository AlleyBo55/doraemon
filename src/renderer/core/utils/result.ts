export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } =>
  result.ok;

export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } =>
  !result.ok;

export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.ok) return result.value;
  throw result.error;
};

export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;

export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> =>
  result.ok ? Ok(fn(result.value)) : result;
