import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import type { ObjectStorage } from "../../application/ports/object-storage";

export class LocalObjectStorage implements ObjectStorage {
  private readonly absoluteRootDir: string;

  constructor(rootDir = ".storage/essay-images") {
    this.absoluteRootDir = isAbsolute(rootDir) ? rootDir : resolve(process.cwd(), rootDir);
  }

  async putObject(input: { key: string; contentType: string; body: Buffer }): Promise<{ objectKey: string }> {
    const objectKey = normalize(input.key).replace(/^(\.\.(\/|\\|$))+/, "");
    const path = join(this.absoluteRootDir, objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
    return { objectKey };
  }

  async getReadableUrlOrPath(objectKey: string): Promise<string> {
    const path = join(this.absoluteRootDir, objectKey);
    await readFile(path);
    return path;
  }
}
