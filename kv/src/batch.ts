import * as hex from "https://deno.land/std@0.217.0/encoding/hex.ts";
import { concatUint8Array, mapBinary } from "./utils.ts";

export type Operation =
  | {
      type: "put";
      key: string;
      value: Uint8Array;
    }
  | {
      type: "del";
      key: string;
    };

export interface Batch {
  ops: Operation[];
  prevHash?: string;
}

export interface HashedBatch extends Batch {
  hash: string;
}

export async function hashBatch(batch: Batch) {
  const encoder = new TextEncoder();
  let hashes = await Promise.all(
    batch.ops.map((x) => hashOperation(x, encoder))
  );

  while (hashes.length > 1) {
    hashes = await Promise.all(
      mapBinary(hashes, ([x, y]) =>
        x == y
          ? x
          : crypto.subtle.digest(
              "sha-256",
              concatUint8Array(new Uint8Array(x), new Uint8Array(y))
            )
      )
    );
  }

  const hash =
    hashes[0] ?? (await crypto.subtle.digest("sha-256", new ArrayBuffer(0)));

  if (batch.prevHash) {
    return crypto.subtle.digest(
      "sha-256",
      concatUint8Array(hex.decodeHex(batch.prevHash), new Uint8Array(hash))
    );
  } else {
    return hash;
  }
}

export async function hashOperation(
  op: Operation,
  encoder = new TextEncoder()
) {
  if (op.type == "put") {
    return await crypto.subtle.digest(
      "sha-256",
      concatUint8Array(
        encoder.encode(op.type + ":" + op.key),
        new Uint8Array(await crypto.subtle.digest("sha-256", op.value))
      )
    );
  } else {
    return await crypto.subtle.digest(
      "sha-256",
      encoder.encode(op.type + ":" + op.key)
    );
  }
}
