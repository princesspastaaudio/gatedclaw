import { describe, expect, it } from "vitest";
import { buildGatingCallbackData, parseGatingCallbackData } from "./callback-data.js";

describe("gating callback data", () => {
  it("round-trips approval callbacks", () => {
    const approvalId = "4b0b0f0b-4d9b-4c1b-9b20-2ce2f7e1f3ff";
    const data = buildGatingCallbackData(approvalId, "approve");
    expect(parseGatingCallbackData(data)).toEqual({ approvalId, action: "approve" });
  });

  it("rejects invalid data", () => {
    expect(parseGatingCallbackData("commands_page_1")).toBeNull();
    expect(parseGatingCallbackData("gating:v1:not-a-uuid:approve")).toBeNull();
    expect(parseGatingCallbackData("gating:v2:123:approve")).toBeNull();
  });
});
