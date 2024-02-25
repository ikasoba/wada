export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json }
  | Json[];

export function* mapBinary<T, R>(
  iter: Iterable<T>,
  fn: (value: [T, T] | [T, T]) => R
): Iterable<R> {
  let bin: [] | [T] | [T, T] = [];

  for (const item of iter) {
    bin = [...bin, item];

    if (bin.length == 2) {
      yield fn(bin);
      bin = [];
    }
  }

  if (bin.length) {
    yield fn([bin[0], bin[0]]);
  }
}

export function concatUint8Array(x: Uint8Array, y: Uint8Array) {
  const buf = new Uint8Array(x.byteLength + y.byteLength);

  buf.set(x);
  buf.set(y, x.byteLength);

  return buf;
}
