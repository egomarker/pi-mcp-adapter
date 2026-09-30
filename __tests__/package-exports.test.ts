import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("Piclaw integration helper exports", () => {
  it.each(["config.ts", "metadata-cache.ts", "resource-tools.ts", "types.ts", "utils.ts"])(
    "resolves the existing %s import through the package export map",
    (subpath) => {
      expect(require.resolve(`pi-mcp-adapter/${subpath}`)).toBe(
        fileURLToPath(new URL(`../${subpath}`, import.meta.url)),
      );
    },
  );
});
