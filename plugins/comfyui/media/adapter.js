// ComfyUI's self-hosted API: https://docs.comfy.org/development/comfyui-server/api-examples
// The host pins input.configuration before start and journals every submission.
const SERVER = "http://127.0.0.1:8188";
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 200 &&
  !/[\u0000-\u001f]/.test(value);

export default {
  image: {
    async start(input, host) {
      if (input.model !== "workflow")
        return { error: "Choose ComfyUI's saved workflow model" };
      if (input.references?.length)
        return {
          error:
            "This workflow takes text only; configure image inputs in ComfyUI",
        };
      const config = input.configuration ?? {};
      const problem = workflowProblem(config);
      if (problem) return { error: problem };
      const workflow = config.workflow;
      workflow[config.promptNode].inputs[config.promptInput] = input.prompt;
      const response = await host.submit("workflow", `${SERVER}/prompt`, {
        method: "POST",
        json: { prompt: workflow },
      });
      if (!response.ok) return { error: await detail(response) };
      const created = await response.json();
      if (!object(created) || !id(created.prompt_id))
        throw new Error(
          "ComfyUI did not return a prompt ID. Check its queue before starting new work; Retry will not submit again.",
        );
      // The complete configuration stays in the host journal, not this small task.
      return {
        task: {
          version: 1,
          promptId: created.prompt_id,
          outputNode: config.outputNode,
        },
        retryAfter: 2,
      };
    },
    async check(task, host) {
      if (
        !object(task) ||
        task.version !== 1 ||
        !id(task.promptId) ||
        !id(task.outputNode)
      )
        throw new Error(
          "Unsupported saved ComfyUI task; keep the original receipt and plugin",
        );
      const response = await host.fetch(
        `${SERVER}/history/${encodeURIComponent(task.promptId)}`,
      );
      if (!response.ok) throw new Error(await detail(response));
      const history = await response.json();
      if (!object(history)) throw new Error("ComfyUI returned invalid history");
      const record = history[task.promptId];
      // History can disappear on a server restart or be evicted. Never replace the prompt.
      if (!record) {
        const queued = await host.fetch(`${SERVER}/queue`);
        if (!queued.ok) throw new Error(await detail(queued));
        const queue = await queued.json();
        if (
          !object(queue) ||
          !Array.isArray(queue.queue_running) ||
          !Array.isArray(queue.queue_pending)
        )
          throw new Error("ComfyUI returned an invalid queue");
        if (
          [...queue.queue_running, ...queue.queue_pending].some(
            (item) => Array.isArray(item) && item[1] === task.promptId,
          )
        )
          return { task, retryAfter: 2 };
        throw new Error(
          "ComfyUI no longer lists this task in its queue or history. Retry keeps the original task; check ComfyUI before starting new work.",
        );
      }
      if (!object(record) || !object(record.status))
        throw new Error("ComfyUI returned an unsupported history record");
      const events = Array.isArray(record.status.messages)
        ? record.status.messages
        : [];
      const failure = events.find(
        (event) =>
          Array.isArray(event) &&
          ["execution_error", "execution_interrupted"].includes(event[0]),
      );
      if (record.status.status_str === "error" || failure) {
        const message = failure?.[1]?.exception_message;
        return {
          error: `ComfyUI task failed or was interrupted${typeof message === "string" ? `: ${message.slice(0, 600)}` : "; inspect its queue and console"}`,
        };
      }
      if (
        record.status.completed !== true ||
        record.status.status_str !== "success"
      )
        return { task, retryAfter: 2 };
      const images = record.outputs?.[task.outputNode]?.images;
      const image = Array.isArray(images) ? images[0] : undefined;
      if (
        !object(image) ||
        !id(image.filename) ||
        typeof image.subfolder !== "string" ||
        image.subfolder.length > 1000 ||
        image.type !== "output"
      )
        throw new Error(
          "The selected SaveImage node returned no downloadable image. Check the output node and ComfyUI history.",
        );
      return {
        outputs: [
          {
            url: `${SERVER}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=output`,
          },
        ],
      };
    },
  },
};

function workflowProblem(config) {
  const workflow = config.workflow;
  if (
    !object(workflow) ||
    Array.isArray(workflow.nodes) ||
    !Object.keys(workflow).length
  )
    return "Import a ComfyUI workflow exported in API format, not the editor's ordinary workflow JSON";
  for (const [key, node] of Object.entries(workflow))
    if (
      !id(key) ||
      !object(node) ||
      typeof node.class_type !== "string" ||
      !node.class_type ||
      !object(node.inputs)
    )
      return "Each API workflow node needs class_type and inputs; export the workflow in API format";
  if (
    !id(config.promptNode) ||
    !id(config.promptInput) ||
    !Object.hasOwn(workflow, config.promptNode) ||
    !Object.hasOwn(workflow[config.promptNode].inputs, config.promptInput) ||
    typeof workflow[config.promptNode].inputs[config.promptInput] !== "string"
  )
    return "Choose the positive prompt node ID and a literal text input from the API workflow";
  if (
    !id(config.outputNode) ||
    !Object.hasOwn(workflow, config.outputNode) ||
    workflow[config.outputNode].class_type !== "SaveImage"
  )
    return "Choose a SaveImage output node ID from the API workflow";
  const pending = [config.outputNode],
    visited = new Set();
  while (pending.length) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    visited.add(key);
    for (const value of Object.values(workflow[key].inputs))
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        Number.isInteger(value[1]) &&
        Object.hasOwn(workflow, value[0])
      )
        pending.push(value[0]);
  }
  if (!visited.has(config.promptNode))
    return "The chosen prompt node must feed the selected SaveImage output";
  return undefined;
}

async function detail(response) {
  const body = await response.json().catch(() => ({}));
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message
      : "request failed; check ComfyUI's console and installed nodes/models";
  return `ComfyUI ${response.status}: ${message.slice(0, 600)}`;
}
