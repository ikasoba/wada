import { Context } from "../deps/hono.ts";

export type InitializedWadaRuntime = WadaRuntime & {
  instance: WebAssembly.Instance & {
    exports: {
      memory?: WebAssembly.Memory;
      _start?(): void;
      _request?(conn_id: number): void;
    };
  };
  module: WebAssembly.Module;
};

export class WadaRuntime {
  static async instantiate(bytes: BufferSource) {
    const runtime = new WadaRuntime();

    const { instance, module } = await WebAssembly.instantiate(
      bytes,
      runtime.createLibrary()
    );

    return runtime.init(instance, module);
  }

  private createLibrary(): WebAssembly.Imports {
    const self = this as InitializedWadaRuntime;

    return {
      // goとかを動かせるように最小限のものを用意する
      wasi_snapshot_preview1: {
        fd_write: (
          fd: number,
          iovs: number,
          iovsLen: number,
          nwritten: number
        ) => 0,
      },
      wada: {
        conn_header: self.conn_header.bind(self),
        conn_body_write: self.conn_body_write.bind(self),
        conn_body_close: self.conn_body_close.bind(self),
      },
    };
  }

  private decoder = new TextDecoder();

  public instance?: WebAssembly.Instance;
  public module?: WebAssembly.Module;

  private connId = 0;
  private connections: Record<
    number,
    {
      ctx: Context;
      write: (buf: ArrayBuffer) => void;
      close: () => void;
    }
  > = {};

  private constructor() {}

  public init(
    instance: InitializedWadaRuntime["instance"],
    module: InitializedWadaRuntime["module"]
  ): InitializedWadaRuntime {
    return Object.assign(this, {
      instance,
      module,
    });
  }

  public start(this: InitializedWadaRuntime) {
    this.instance.exports._start?.();
  }

  public fetch(this: InitializedWadaRuntime, ctx: Context): Promise<Response> {
    const { writable, readable } = new TransformStream<
      ArrayBuffer,
      ArrayBuffer
    >();
    const writer = writable.getWriter();

    ctx.newResponse(readable);

    return new Promise((resolve) => {
      const conn: WadaRuntime["connections"][number] = {
        ctx,
        write: (buf) => {
          resolve(ctx.res);
          writer.write(buf);
        },
        close: () => {
          resolve(ctx.res);
          writer.releaseLock();
          writable.close();

          delete this.connections[connId];
        },
      };

      const connId = this.connId++;
      this.connections[connId] = conn;

      this.instance.exports._request?.(connId);
    });
  }

  private conn_header(
    this: InitializedWadaRuntime,
    conn_id: number,
    name_ptr: number,
    name_len: number,
    value_ptr: number,
    value_len: number,
    append: number
  ) {
    const conn = this.connections[conn_id];
    if (!conn || !this.instance.exports.memory) return;

    const name = this.decoder.decode(
      this.instance.exports.memory.buffer.slice(name_ptr, name_ptr + name_len)
    );

    const value = this.decoder.decode(
      this.instance.exports.memory.buffer.slice(
        value_ptr,
        value_ptr + value_len
      )
    );

    conn.ctx.header(name, value, { append: !!append });
  }

  private conn_body_write(
    this: InitializedWadaRuntime,
    conn_id: number,
    body_ptr: number,
    body_len: number
  ) {
    const conn = this.connections[conn_id];
    if (!conn || !this.instance.exports.memory) return;

    const body = this.instance.exports.memory.buffer.slice(
      body_ptr,
      body_ptr + body_len
    );

    conn.write(body);
  }

  private conn_body_close(this: InitializedWadaRuntime, conn_id: number) {
    const conn = this.connections[conn_id];
    if (!conn || !this.instance.exports.memory) return;

    conn.close();
  }
}
