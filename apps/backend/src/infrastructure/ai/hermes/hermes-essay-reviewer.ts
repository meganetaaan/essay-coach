import type { EssayReviewer, EssayReviewRequest, EssayReviewResult } from "../../../application/ports/essay-reviewer";
import type { HermesCommandRunner } from "./hermes-command-runner";
import { HermesReviewOutputParser } from "./hermes-review-output-parser";
import { HermesReviewPromptBuilder } from "./hermes-review-prompt-builder";

export class HermesEssayReviewer implements EssayReviewer {
  constructor(
    private readonly runner: HermesCommandRunner,
    private readonly promptBuilder = new HermesReviewPromptBuilder(),
    private readonly parser = new HermesReviewOutputParser()
  ) {}

  async reviewEssayImage(request: EssayReviewRequest): Promise<EssayReviewResult> {
    const prompt = this.promptBuilder.build(request);
    const output = await this.runner.runChat({ prompt, imagePath: request.imageUrlOrPath });
    return this.parser.parse(output, request.strictness, request.childGrade);
  }
}
