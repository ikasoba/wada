import { HashedBatch } from "./batch.ts";
import { hashBatch } from "./batch.ts";
import { Batch } from "./batch.ts";
import { Operation } from "./batch.ts";

export class BatchBuilder {
  constructor(public ops: Operation[] = []) {}

  set(key: string, value: Uint8Array) {
    this.ops.push({
      type: "put",
      key,
      value,
    });
  }

  rm(key: string) {
    this.ops.push({
      type: "del",
      key,
    });
  }

  create(prevHash?: string): Batch {
    return {
      ops: this.ops,
      prevHash,
    };
  }
}
