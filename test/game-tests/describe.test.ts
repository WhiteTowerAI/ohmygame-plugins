import { describe, expect, it } from "vitest";
// @ts-expect-error The panel's own module is plain JavaScript.
import { describeStep } from "../../plugins/game-tests/panel/describe.js";

describe("a step in words", () => {
  it("names the player only when there are several", () => {
    const step = { action: { type: "type", target: { role: "textbox", name: "Room" }, text: "{{room}}" } };
    expect(describeStep(step, 1, "en")).toEqual({ who: undefined, does: "Type “{{room}}” into textbox “Room”", checks: [] });
    expect(describeStep({ ...step, player: 2 }, 2, "zh-CN")).toEqual({ who: "玩家 2", does: "在 textbox “Room” 输入 “{{room}}”", checks: [] });
  });

  it("lists every check, with how long they are retried", () => {
    const step = { expect: { visible: [{ testId: "score" }], disabled: [{ text: "Start" }], state: { score: { gte: 10 }, room: { exists: true } }, notBlank: true, timeoutMs: 5000 } };
    expect(describeStep(step, 1, "zh-CN").checks).toEqual([
      "显示: testId “score”",
      "显示但不能使用: 文字 “Start”",
      "状态 score 不小于 10",
      "状态 room 存在",
      "画面不是空白 (5000 毫秒内)",
    ]);
  });

  it("reads the test's own actions and falls back to English", () => {
    expect(describeStep({ action: { type: "reload" } }, 1, "es").does).toBe("Reload the page");
    expect(describeStep({ action: { type: "bridge", method: "setSeed", value: 7 } }, 1, "en").does).toBe("Call the game's setSeed(7)");
  });
});
