import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HermesCommandRunner {
  runChat(prompt: string): Promise<string>;
}

export class CliHermesCommandRunner implements HermesCommandRunner {
  async runChat(prompt: string): Promise<string> {
    const { stdout } = await execFileAsync("hermes", ["chat", "-q", prompt], {
      maxBuffer: 1024 * 1024 * 5
    });
    return stdout;
  }
}
