import { describe, expect, it } from "vitest";
import { CloudflareR2ObjectStorage, type R2BucketLike } from "../src/infrastructure/storage/cloudflare-r2-object-storage";

describe("CloudflareR2ObjectStorage", () => {
  it("stores bytes by key, forwards content type metadata, and returns the object key", async () => {
    const bucket = new FakeR2Bucket();
    const storage = new CloudflareR2ObjectStorage({ bucket });

    const result = await storage.putObject({
      key: "child-1/2026-05-21/attempt-1.png",
      contentType: "image/png",
      body: Buffer.from("image-bytes")
    });

    expect(result).toEqual({ objectKey: "child-1/2026-05-21/attempt-1.png" });
    expect(bucket.puts).toEqual([
      {
        key: "child-1/2026-05-21/attempt-1.png",
        body: Buffer.from("image-bytes"),
        httpMetadata: { contentType: "image/png" }
      }
    ]);
  });

  it("returns the stored key as the readable path when no public base URL is configured", async () => {
    const storage = new CloudflareR2ObjectStorage({ bucket: new FakeR2Bucket() });

    await expect(storage.getReadableUrlOrPath("child-1/image.png")).resolves.toBe("child-1/image.png");
  });

  it("returns a public URL with the object key safely appended when configured", async () => {
    const storage = new CloudflareR2ObjectStorage({
      bucket: new FakeR2Bucket(),
      publicBaseUrl: "https://images.example.test/base/"
    });

    await expect(storage.getReadableUrlOrPath("child 1/essay image.png")).resolves.toBe(
      "https://images.example.test/base/child%201/essay%20image.png"
    );
  });
});

class FakeR2Bucket implements R2BucketLike {
  readonly puts: Array<{ key: string; body: Buffer; httpMetadata?: { contentType?: string } }> = [];

  async put(key: string, body: Buffer, options?: { httpMetadata?: { contentType?: string } }): Promise<void> {
    this.puts.push({ key, body, httpMetadata: options?.httpMetadata });
  }
}
