// @vitest-environment happy-dom
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { File as NodeFile } from "node:buffer";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const hostRoot = path.resolve(process.env.OHMYGAME_APP ?? "app");
let served: string;
let calls: { method: string; params?: Record<string, unknown> }[];
let answer: (
  id: number,
  method: string,
  params?: Record<string, unknown>,
) => void;
let app: MessagePort;

beforeAll(async () => {
  // happy-dom has no top layer. Exercise component state here; the Electron
  // panel regression and interactive browser checks cover native placement.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};

  await mkdir(".runtime", { recursive: true });
  served = await realpath(await mkdtemp(path.join(".runtime", "test-ui-")));
  await mkdir(path.join(served, "_ohmygame"));
  await cp(
    path.join(hostRoot, "packages/plugin-ui/index.js"),
    path.join(served, "_ohmygame/plugin-ui.js"),
  );
  await cp(
    path.join(hostRoot, "packages/plugin-ui/ui"),
    path.join(served, "_ohmygame/ui"),
    { recursive: true },
  );
  // As in a page, the components load before the app sends its port.
  await import(/* @vite-ignore */ path.join(served, "_ohmygame/ui/1/index.js"));
  const channel = new MessageChannel();
  app = channel.port1;
  app.onmessage = ({ data }) => {
    if (typeof data?.id !== "number") return;
    calls.push({
      method: data.method,
      ...(data.params ? { params: data.params } : {}),
    });
    answer(data.id, data.method, data.params);
  };
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: {
        type: "ohmygame-plugin-ui",
        plugin: { id: "acme/panel", version: "1.0.0", panel: "main" },
        locale: "en",
      },
      ports: [channel.port2 as never],
    }),
  );
});
afterAll(async () => {
  app.close();
  await rm(served, { recursive: true, force: true });
});
beforeEach(() => {
  document.body.replaceChildren();
  calls = [];
  answer = (id) => app.postMessage({ id, result: { ok: true } });
});

const shadow = (element: Element, part: string) =>
  element.shadowRoot!.querySelector<HTMLElement>(`[part~="${part}"]`)!;
const html = <T extends HTMLElement = HTMLElement>(markup: string): T => {
  document.body.innerHTML = markup;
  return document.body.firstElementChild as T;
};

describe("TapTap panel", () => {
  it("preserves draft editing through a confirmed image upload, hidden failure and retry", async () => {
    const fixtures = JSON.parse(
      await readFile("test/taptap/panel-scenarios.json", "utf8"),
    )["ohmygame/taptap"].connected;
    fixtures.module.fields.icon = {
      field_id: "icon",
      label: "Icon",
      input_type: "image",
      state: "required",
      current_value: null,
    };
    for (const [fieldId, state, validation_error] of [
      ["website", "readonly", undefined],
      ["age_rating", "required", undefined],
      ["qualification", "readonly", "Check qualification"],
    ]) {
      fixtures.module.fields[fieldId!] = {
        field_id: fieldId,
        label: fieldId,
        input_type: "text",
        state,
        current_value: "fixture",
        validation_error,
      };
    }
    let confirmed = false;
    let pendingUpload: number | undefined;
    let attempts = 0;
    answer = (id, method, params) => {
      if (method === "ui.confirm") {
        app.postMessage({ id, result: confirmed });
        return;
      }
      if (method === "command.run") {
        const command = String(params?.command);
        if (command === "save-fields") {
          const input = params?.input as {
            changes: { fieldId: string; value: unknown }[];
          };
          for (const change of input.changes)
            fixtures.module.fields[change.fieldId].current_value = change.value;
          app.postMessage({
            id,
            result: {
              module: fixtures.module,
              saved: input.changes.map((change) => change.fieldId),
              unresolved: [],
            },
          });
          return;
        }
        if (command === "upload-image") {
          attempts++;
          if (attempts === 1) {
            pendingUpload = id;
            return;
          }
          app.postMessage({
            id,
            result: {
              image_id: 31,
              url: "https://img.tapimg.com/fixture.png",
              width: 512,
              height: 512,
            },
          });
          return;
        }
        app.postMessage({
          id,
          result:
            command === "image"
              ? { src: "data:image/png;base64," }
              : fixtures[command],
        });
        return;
      }
      app.postMessage({
        id,
        result: method === "files.write" ? params?.path : null,
      });
    };
    const timers = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(() => 0 as never);
    try {
      html(`<omg-page id="taptap"></omg-page>`);
      const source = (
        await readFile("plugins/taptap/panel/main.js", "utf8")
      ).replace('"/_ohmygame/plugin-ui.js"', '"./_ohmygame/plugin-ui.js"');
      const modulePath = path.join(served, "taptap-panel.js");
      await writeFile(modulePath, source);
      await import(/* @vite-ignore */ modulePath);
      // Collapse optional reference fields, never required or invalid fields.
      const fields = document.querySelector(".fields")!;
      const additional = fields.querySelector("omg-disclosure")!;
      expect(additional.textContent).toContain("website");
      expect(additional.textContent).not.toContain("age_rating");
      expect(additional.textContent).not.toContain("qualification");
      expect(fields.textContent).toContain("age_rating");
      expect(fields.textContent).toContain("Check qualification");
      const dialog = document.querySelector("omg-dialog")! as HTMLElement & {
        open: boolean;
      };
      expect(dialog).not.toBeNull();
      dialog.open = true;
      const picker = dialog.querySelector("omg-file-picker")! as HTMLElement & {
        files: File[];
      };
      const file = new NodeFile(["image bytes"], "icon.png", {
        type: "image/png",
      });
      const drop = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
      shadow(picker, "dropzone").dispatchEvent(drop);
      expect(
        calls.filter((call) => call.method === "files.write"),
      ).toHaveLength(0);
      const upload = dialog.querySelector("omg-button[variant=primary]")!;
      shadow(upload, "button").click();
      await vi.waitFor(() =>
        expect(calls.some((call) => call.method === "ui.confirm")).toBe(true),
      );
      await vi.waitFor(() =>
        expect(upload.hasAttribute("disabled")).toBe(false),
      );
      expect(
        calls.filter((call) => call.method === "files.write"),
      ).toHaveLength(0);
      confirmed = true;
      shadow(upload, "button").click();
      await vi.waitFor(() => expect(pendingUpload).toBeTypeOf("number"));
      const writes = calls.filter((call) => call.method === "files.write");
      expect(writes).toHaveLength(1);
      expect(writes[0]!.params!.path).toMatch(
        /^taptap-materials\/[a-f0-9-]+\.png$/,
      );
      expect((writes[0]!.params!.data as Blob).size).toBe(file.size);
      dialog.open = false;
      app.postMessage({ id: pendingUpload, error: "Fixture upload failed" });
      await vi.waitFor(() =>
        expect(
          document.querySelector("#taptap > .notice")!.textContent,
        ).toContain("Fixture upload failed"),
      );
      expect(picker.files).toHaveLength(1);
      dialog.open = true;
      await vi.waitFor(() =>
        expect(upload.hasAttribute("disabled")).toBe(false),
      );
      shadow(upload, "button").click();
      await vi.waitFor(() => expect(dialog.open).toBe(false));
      expect(
        calls.filter((call) => call.method === "files.write"),
      ).toHaveLength(1);
      expect(document.querySelector("#taptap > .notice")!.textContent).toBe("");
      const uploads = calls.filter(
        (call) => call.params?.command === "upload-image",
      );
      expect(uploads).toHaveLength(2);
      expect(uploads[0]!.params!.input).toEqual(uploads[1]!.params!.input);
      expect(calls.some((call) => call.params?.command === "save-fields")).toBe(
        false,
      );
      const titleInput = document.querySelector(
        'omg-input[label="Game name *"]',
      )! as HTMLElement & { value: string };
      titleInput.value = "Renamed garden";
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      const save = document.querySelector(
        '.save-bar omg-button[variant="primary"]',
      )!;
      shadow(save, "button").click();
      await vi.waitFor(() =>
        expect(document.querySelector("#taptap")!.getAttribute("heading")).toBe(
          "Renamed garden",
        ),
      );
      await vi.waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
      expect(document.querySelector("#taptap > .notice")!.textContent).toBe("");
      expect(document.querySelector(".store-preview")!.textContent).toContain(
        "Renamed garden",
      );
      const refresh = [...document.querySelectorAll("omg-button")].find(
        (button) => button.textContent === "Refresh",
      )!;
      const uploadBuild = [...document.querySelectorAll("omg-button")].find(
        (button) => button.textContent === "Check and upload",
      )!;
      fixtures.capabilities.available_package_types = [];
      fixtures.capabilities.empty_reason = "declared_not_applicable";
      shadow(refresh, "button").click();
      await vi.waitFor(() =>
        expect(uploadBuild.hasAttribute("disabled")).toBe(true),
      );
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(
          "Platform support is required",
        ),
      );
      await vi.waitFor(() =>
        expect(refresh.hasAttribute("disabled")).toBe(false),
      );
      fixtures.capabilities.available_package_types = ["h5"];
      shadow(refresh, "button").click();
      await vi.waitFor(() =>
        expect(uploadBuild.hasAttribute("disabled")).toBe(false),
      );
      expect(document.body.textContent).not.toContain(
        "Platform support is required",
      );
    } finally {
      timers.mockRestore();
    }
  });
});
