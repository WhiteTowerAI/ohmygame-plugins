import { playScript } from "../../shared/vn/player.js";
const script = await (await fetch(new URL("./script.txt", import.meta.url))).text();

export function mount(context) {
  return playScript(context, script, { source: "nodes/{{id}}/script.txt" });
}
