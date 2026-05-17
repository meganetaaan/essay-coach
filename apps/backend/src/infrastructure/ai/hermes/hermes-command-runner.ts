import { execFile } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HermesCommandRunnerInput {
  prompt: string;
  imagePath: string;
}

export interface HermesCommandRunner {
  runChat(input: HermesCommandRunnerInput): Promise<string>;
}

export class CliHermesCommandRunner implements HermesCommandRunner {
  constructor(
    private readonly options: {
      command?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  buildArgs(input: HermesCommandRunnerInput): string[] {
    return [
      "chat",
      "-Q",
      "--provider",
      "openai-codex",
      "-m",
      "gpt-5.5",
      "--source",
      "essay-coach-review",
      "--max-turns",
      "4",
      "--image",
      input.imagePath,
      "-q",
      input.prompt
    ];
  }

  buildExecOptions(): ExecFileOptions {
    return {
      maxBuffer: 1024 * 1024 * 5,
      timeout: this.options.timeoutMs ?? 180_000
    };
  }

  async runChat(input: HermesCommandRunnerInput): Promise<string> {
    const { stdout } = await execFileAsync(this.options.command ?? "hermes", this.buildArgs(input), this.buildExecOptions());
    return typeof stdout === "string" ? stdout : stdout.toString("utf8");
  }
}
