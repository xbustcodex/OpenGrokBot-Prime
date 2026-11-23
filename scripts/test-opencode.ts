/**
 * Quick smoke test for OpenCode free-model routing.
 * Run: npm run test:opencode
 */
import dotenv from "dotenv";
dotenv.config();

import { OpenCodeBackend } from "../src/backends/opencode.js";

async function main() {
  const backend = new OpenCodeBackend();
  console.log("Free models:", backend.listFreeModels());

  try {
    const res = await backend.chat({
      preferFree: true,
      messages: [
        { role: "user", content: "Reply with exactly: OpenGrokBot-Prime online" },
      ],
      maxTokens: 64,
    });
    console.log("Model used:", res.model);
    console.log("Content:", res.content);
    console.log("Usage:", res.usage);
  } catch (e: any) {
    console.error("OpenCode call failed (expected if no network / quota):", e.message);
    process.exitCode = 1;
  }
}

main();
