import { afterEach, describe, expect, it } from "vitest";
import { extractOAuthConfig } from "../mcp-auth-flow.ts";
import {
  interpolateEnvRecord,
  interpolateEnvVars,
  resolveBearerToken,
  resolveCommandSecret,
  resolveConfigPath,
  resolveServerUrl,
} from "../utils.ts";

describe("OpenCode environment interpolation", () => {
  const original = {
    MCP_TEST_VALUE: process.env.MCP_TEST_VALUE,
    MCP_TEST_URL: process.env.MCP_TEST_URL,
    MCP_TEST_BEARER_TOKEN_ENV: process.env.MCP_TEST_BEARER_TOKEN_ENV,
  };

  afterEach(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("supports {env:VAR} in env, headers, cwd, and OAuth fields", () => {
    process.env.MCP_TEST_VALUE = "interpolated";
    process.env.MCP_TEST_URL = "https://example.test/mcp";

    expect(interpolateEnvVars("prefix-{env:MCP_TEST_VALUE}")).toBe("prefix-interpolated");
    expect(interpolateEnvRecord({ Authorization: "Bearer {env:MCP_TEST_VALUE}" })).toEqual({
      Authorization: "Bearer interpolated",
    });
    expect(resolveConfigPath("{env:MCP_TEST_VALUE}/server")).toBe("interpolated/server");
    expect(extractOAuthConfig({
      url: "https://example.test/mcp",
      oauth: {
        clientId: "{env:MCP_TEST_VALUE}-client",
        clientSecret: "{env:MCP_TEST_VALUE}-secret",
        scope: "scope-{env:MCP_TEST_VALUE}",
        skipIssuerMetadataValidation: true,
      },
    })).toEqual({
      clientId: "interpolated-client",
      clientSecret: "interpolated-secret",
      scope: "scope-interpolated",
      skipIssuerMetadataValidation: true,
    });
  });

  it("resolves command secrets without executing cache-facing expressions", () => {
    process.env.MCP_TEST_VALUE = "interpolated";
    process.env.MCP_TEST_BEARER_TOKEN_ENV = "!literal-token";
    const expression = `!node -e "process.stdout.write('  resolved  ')"`;

    expect(resolveCommandSecret(expression, "test secret")).toBe("resolved");
    expect(resolveCommandSecret("!!literal-{env:MCP_TEST_VALUE}", "test secret")).toBe("!literal-interpolated");
    expect(interpolateEnvRecord({ Secret: expression })).toEqual({ Secret: expression });
    expect(resolveBearerToken({ bearerTokenEnv: "MCP_TEST_BEARER_TOKEN_ENV" })).toBe("!literal-token");

    expect(() => resolveCommandSecret(
      `!node -e "process.stderr.write('private-stderr'); process.exit(7)"`,
      "test secret",
    )).toThrow(/^Failed to resolve test secret: command exited with code 7$/);
    expect(() => resolveCommandSecret(`!node -e ""`, "test secret"))
      .toThrow(/^Failed to resolve test secret: command returned empty output$/);
  });

  it("runs command secrets and tilde expansion with only the scoped environment", () => {
    process.env.UNRELATED_PROCESS_SECRET = "ambient";
    const runtimeEnv = { SCOPED: "visible", HOME: "/scoped/home" };
    const expression = `!${JSON.stringify(process.execPath)} -e "process.stdout.write((process.env.SCOPED||'')+'|'+String(process.env.UNRELATED_PROCESS_SECRET))"`;
    expect(resolveCommandSecret(expression, "scoped command", runtimeEnv)).toBe("visible|undefined");
    expect(resolveConfigPath("~/server", runtimeEnv)).toBe("/scoped/home/server");
    expect(() => resolveConfigPath("~/server", { SCOPED: "visible" })).toThrow("requires HOME");
    delete process.env.UNRELATED_PROCESS_SECRET;
  });

  it("redacts interpolated URL values from validation errors", () => {
    const secretUrl = "not a url with secret-value";
    expect(() => resolveServerUrl({ url: "${SECRET_URL}" }, { SECRET_URL: secretUrl })).toThrow(
      "Invalid MCP server URL after environment interpolation",
    );
    try { resolveServerUrl({ url: "${SECRET_URL}" }, { SECRET_URL: secretUrl }); } catch (error) {
      expect(String(error)).not.toContain("secret-value");
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it("rejects invalid OAuth fields before interpolation", () => {
    expect(() => extractOAuthConfig({
      url: "https://example.test/mcp",
      oauth: { clientId: 42 } as any,
    })).toThrow("OAuth clientId must be a string");
    expect(() => extractOAuthConfig({
      url: "https://example.test/mcp",
      oauth: { skipIssuerMetadataValidation: "true" } as any,
    })).toThrow("OAuth skipIssuerMetadataValidation must be a boolean");
  });

  it("fails closed before URL resolution when a brace variable is missing", () => {
    delete process.env.MCP_TEST_URL;
    expect(() => resolveServerUrl({ url: "https://{env:MCP_TEST_URL}/mcp" })).toThrow(
      "Missing environment variable in MCP server URL: MCP_TEST_URL",
    );
  });
});
