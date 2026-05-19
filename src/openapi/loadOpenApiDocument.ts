import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(dir, "..", "..", "docs", "openapi.json");

export function loadOpenApiDocument(): Record<string, unknown> {
  return JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
}
