export interface ObjectStorage {
  putObject(input: { key: string; contentType: string; body: Buffer }): Promise<{ objectKey: string }>;
  getReadableUrlOrPath(objectKey: string): Promise<string>;
}
