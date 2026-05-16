import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import type { ObjectStorage } from "../../application/ports/object-storage";

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly rootDir = ".storage/essay-images") {}

  async putObject(input: { key: string; contentType: string; body: Buffer }): Promise<{ objectKey: string }> {
    const objectKey = normalize(input.key).replace(/^(\.\.(\/|\\|$))+/, "");
    const path = join(this.rootDir, objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
    return { objectKey };
  }

  async getReadableUrlOrPath(objectKey: string): Promise<string> {
    const path = join(this.rootDir, objectKey);
    await readFile(path);
    return path;
  }
}
