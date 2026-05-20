import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCompositionRoot, resolveReviewerMode } from "../apps/backend/src/app/composition-root";
import { createClerkActorResolverFromEnv } from "../apps/backend/src/app/clerk-auth";
import { resolveActorFromRequest } from "../apps/backend/src/interfaces/http/auth-context";
import {
  handleCreateMvpSubmission,
  handleGetMvpSubmissionStatus,
  handleListMvpMonthSubmissions
} from "../apps/backend/src/interfaces/http/mvp-submissions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
const port = 4173;
const root = path.resolve(__dirname, "../apps/frontend/dist");
const indexFile = path.join(root, "index.html");
const reviewer = resolveReviewerMode(process.env.ESSAY_COACH_REVIEWER);
const mvpRoot = createCompositionRoot({ reviewer });
const actorResolver = createClerkActorResolverFromEnv(process.env);
const sqlitePath = process.env.ESSAY_COACH_SQLITE_PATH || ".storage/essay-coach.sqlite";
let isProcessingReview = false;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

if (!existsSync(indexFile)) {
  console.error("Missing apps/frontend/dist/index.html. Run `pnpm build` before `pnpm preview:mvp`.");
  process.exit(1);
}

function sendText(response: ServerResponse, statusCode: number, body: string) {
  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(body),
    "content-type": "text/plain; charset=utf-8"
  });
  response.end(body);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(payload);
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function streamFile(request: IncomingMessage, response: ServerResponse, filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  response.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream"
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function resolveRequestPath(url: string) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const requestedPath = path.resolve(root, `.${pathname}`);

  if (!requestedPath.startsWith(`${root}${path.sep}`) && requestedPath !== root) {
    return null;
  }

  return requestedPath;
}

function triggerReviewProcessing() {
  if (isProcessingReview) return;
  isProcessingReview = true;
  void processQueuedReviews();
}

async function processQueuedReviews() {
  try {
    while (true) {
      const result = await mvpRoot.processReviewJob();
      if (!result.processed) return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`MVP review processing failed: ${message}`);
  } finally {
    isProcessingReview = false;
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Bad request\n");
    return;
  }

  const url = new URL(request.url, `http://${host}:${port}`);

  if (url.pathname === "/api/mvp/submissions") {
    const actorResult = await resolveActorFromRequest(toFetchRequest(request), actorResolver);
    if (!actorResult.ok) {
      sendJson(response, actorResult.status, actorResult.body);
      return;
    }

    if (request.method === "GET") {
      const result = await handleListMvpMonthSubmissions(
        {
          year: url.searchParams.get("year") ?? undefined,
          month: url.searchParams.get("month") ?? undefined
        },
        mvpRoot,
        actorResult.actor
      );
      sendJson(response, result.status, result.body);
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const result = await handleCreateMvpSubmission(body, mvpRoot, actorResult.actor);
      sendJson(response, result.status, result.body);
      if (result.status === 201) triggerReviewProcessing();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected API error";
      sendJson(response, message.includes("JSON") || message.includes("too large") ? 400 : 500, { error: message });
    }
    return;
  }

  const submissionStatusMatch = url.pathname.match(/^\/api\/mvp\/submissions\/([^/]+)$/);
  if (submissionStatusMatch) {
    const actorResult = await resolveActorFromRequest(toFetchRequest(request), actorResolver);
    if (!actorResult.ok) {
      sendJson(response, actorResult.status, actorResult.body);
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    const result = await handleGetMvpSubmissionStatus(decodeURIComponent(submissionStatusMatch[1] ?? ""), mvpRoot, actorResult.actor);
    sendJson(response, result.status, result.body);
    return;
  }

  if (!["GET", "HEAD"].includes(request.method || "")) {
    sendText(response, 405, "Method not allowed\n");
    return;
  }

  const requestedPath = resolveRequestPath(request.url);

  if (!requestedPath) {
    sendText(response, 403, "Forbidden\n");
    return;
  }

  try {
    const fileStats = await stat(requestedPath);
    const filePath = fileStats.isDirectory() ? path.join(requestedPath, "index.html") : requestedPath;
    const resolvedFilePath = path.resolve(filePath);

    if (!resolvedFilePath.startsWith(`${root}${path.sep}`)) {
      sendText(response, 403, "Forbidden\n");
      return;
    }

    streamFile(request, response, resolvedFilePath);
  } catch {
    const acceptsHtml = request.headers.accept?.includes("text/html") || path.extname(requestedPath) === "";

    if (acceptsHtml) {
      streamFile(request, response, indexFile);
      return;
    }

    sendText(response, 404, "Not found\n");
  }
});

function toFetchRequest(request: IncomingMessage): Request {
  return new Request(`http://${request.headers.host ?? `${host}:${port}`}${request.url ?? "/"}`, {
    headers: request.headers as HeadersInit,
    method: request.method
  });
}

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use on ${host}. Stop that process and rerun \`pnpm preview:mvp\`.`);
    process.exit(1);
  }

  console.error(`Unable to start preview server on http://${host}:${port}: ${error.message}`);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Essay Coach MVP preview running at http://${host}:${port}`);
  console.log(`MVP reviewer: ${reviewer}`);
  console.log(`MVP SQLite DB: ${sqlitePath}`);
});
