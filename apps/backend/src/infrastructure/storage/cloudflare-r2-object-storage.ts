import type { ObjectStorage } from "../../application/ports/object-storage";

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
}

export class CloudflareR2ObjectStorage implements ObjectStorage {
  private readonly bucket: R2BucketLike;
  private readonly publicBaseUrl?: string;

  constructor(options: { bucket: R2BucketLike; publicBaseUrl?: string }) {
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl?.replace(/\/+$/, "");
  }

  async putObject(input: { key: string; contentType: string; body: Buffer }): Promise<{ objectKey: string }> {
    await this.bucket.put(input.key, input.body, {
      httpMetadata: {
        contentType: input.contentType
      }
    });
    return { objectKey: input.key };
  }

  async getReadableUrlOrPath(objectKey: string): Promise<string> {
    if (!this.publicBaseUrl) return objectKey;
    return `${this.publicBaseUrl}/${encodeObjectKeyPath(objectKey)}`;
  }
}

function encodeObjectKeyPath(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}
