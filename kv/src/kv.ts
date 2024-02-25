import { hashBatch } from "./batch.ts";
import { Batch } from "./batch.ts";
import { HashedBatch } from "./batch.ts";
import { BatchOperation, Level } from "npm:level@8.0.1";
import * as cbor from "npm:cbor-x@1.5.8";

export class WadaKv {
  static async create(path: string) {
    const level = new Level<string, Uint8Array>(path, {
      keyEncoding: "utf8",
      valueEncoding: "buffer",
    });

    const history = await level
      .get("history")
      .then((x) => cbor.decode(x) as HashedBatch[])
      .catch(() => []);

    return new WadaKv(level, history);
  }

  constructor(
    public level: Level<string, Uint8Array>,
    public history: HashedBatch[] = []
  ) {}

  request(batch: HashedBatch): BatchRequest {
    return new BatchRequest(this, batch);
  }

  getLastBatch() {
    return this.history.at(-1);
  }

  async get(key: string) {
    try {
      return await this.level.get(`wd:${key}`);
    } catch {
      return undefined;
    }
  }

  async process(batch: HashedBatch) {
    const lastBatch = this.getLastBatch();

    if (lastBatch?.hash == batch.prevHash) {
      const ops: BatchOperation<
        Level<string, Uint8Array>,
        string,
        Uint8Array
      >[] = batch.ops.map((op) => {
        if (op.type == "put") {
          return { type: "put", key: `wd:${op.key}`, value: op.value };
        } else {
          return { type: "del", key: `wd:${op.key}` };
        }
      });

      this.history.push(batch);

      ops.push({
        type: "put",
        key: "history",
        value: cbor.encode(this.history),
      });

      await this.level.batch(ops);
    }
  }
}

export class BatchRequest {
  constructor(public kv: WadaKv, public batch: HashedBatch) {}

  accept() {
    return this.kv.process(this.batch);
  }
}
