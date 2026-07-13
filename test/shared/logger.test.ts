import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/shared/logger.js";

describe("logger", () => {
  const originalLogLevel = process.env["LOG_LEVEL"];

  beforeEach(() => {
    delete process.env["LOG_LEVEL"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLogLevel === undefined) {
      delete process.env["LOG_LEVEL"];
    } else {
      process.env["LOG_LEVEL"] = originalLogLevel;
    }
  });

  it("writes JSON lines to stderr", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logger.info("hello", { foo: "bar" });
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const line = stderrSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ level: "info", message: "hello", foo: "bar" });
  });

  it("suppresses info logs when LOG_LEVEL=error", () => {
    process.env["LOG_LEVEL"] = "error";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logger.info("should be suppressed");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("still emits error logs when LOG_LEVEL=error", () => {
    process.env["LOG_LEVEL"] = "error";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logger.error("failure");
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it("never writes to stdout", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logger.error("err");
    logger.warn("warn");
    logger.info("info");
    logger.debug("debug");
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
  });
});
