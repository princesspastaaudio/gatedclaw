import { afterEach, describe, expect, it } from "vitest";
import { resolveShellCommand } from "./shell-utils.js";

const isWin = process.platform === "win32";

describe("resolveShellCommand", () => {
  const originalShell = process.env.SHELL;

  afterEach(() => {
    if (typeof originalShell === "string") {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
  });

  it("prefers config shellPath when provided", () => {
    const resolved = resolveShellCommand({ shellPath: "/bin/bash" });
    expect(resolved).toBe("/bin/bash");
  });

  it("falls back to a non-empty default", () => {
    delete process.env.SHELL;
    const resolved = resolveShellCommand();
    expect(resolved).toBeTruthy();
    if (!isWin) {
      expect(resolved).toBe("bash");
    }
  });
});
