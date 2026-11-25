# ComfyUI Beta

An optional image provider for an existing local ComfyUI server. Requires
OhMyGame plugin API **2.31+** (current `dev`). Install `@ohmygame/comfyui`
from the plugin market, or add this folder with Develop on for local testing.

## Set up

1. Start ComfyUI at **http://127.0.0.1:8188**. First confirm your image workflow
   works in ComfyUI with its installed checkpoints and custom nodes.
2. Export the workflow in **API format**. Depending on the frontend version,
   enable developer options and use **Save (API Format)**, or **Export (API)**.
   Ordinary editor JSON containing `nodes` and `links` is not accepted.
3. In the plugin's Settings, import the JSON (a JSON object, up to 256 KiB).
   Do not include credentials. Enter the positive prompt node ID, its text
   input name (usually `text`), and a connected **SaveImage** output node ID.
   IDs are the top-level keys of the exported API JSON. For the default SD
   example they are `6`, `text`, and `9`; your workflow can use different IDs.
4. Save, enable the plugin for every project and allow its exact local network
   destination. Select **ComfyUI → Saved workflow** for an image on the canvas.

Only the selected prompt input changes. Negative prompts, checkpoints, custom
nodes, seed, batch size and dimensions stay as exported. Use batch size 1 for
one result; if the selected output produces multiple images, only its first is
imported. All outputs in the workflow still execute. Dimensions are controlled
in ComfyUI, so OhMyGame hides its resolution and aspect-ratio selectors.
To vary a fixed seed or change the workflow, edit/re-export it and start new work.

This Beta supports text-to-image workflow input and local port 8188. It does
not install ComfyUI, models or nodes, upload reference images, or connect to
Comfy Cloud, LAN hosts, custom ports or authenticated servers. Local nodes may
have their own network or resource behavior: use a workflow you understand.
No additional ComfyUI API key or callback configuration is needed.

## Stop and recover

Each generation saves its own workflow snapshot before submission. Changing or
clearing plugin settings does not change an existing job. **Stop**, timeout or
closing OhMyGame stops local waiting; it does not interrupt ComfyUI or other
workflows. Keep ComfyUI running and use the original job's **Retry** action to
resume. Starting Generate again creates a new job.

The plugin journals `POST /prompt`, polls that prompt's `/history/{id}` and
`/queue`, then downloads its selected output through `/view`. It never calls
`/interrupt`, clears the queue or automatically replaces a missing task.
ComfyUI history may be lost on a server restart or evicted. If the task cannot
be found, check ComfyUI's history/output folder before explicitly generating
again. An uncertain submission response cannot safely be sent again.

A settings error before the snapshot is saved sends no request. If validation
fails after saving the snapshot, fix the settings and start a new generation;
Retry intentionally keeps the old snapshot. Keep the original plugin version
for a staged retry if an upgrade changes its submission contract.

## Local acceptance

- Import a working API workflow with a non-square output. Generate Chinese and
  English prompts; verify the actual dimensions, negative prompt, checkpoint
  and seed match the exported workflow. Check the plugin logo and Beta badge.
- Confirm resolution/aspect controls are hidden and reference-image input is
  unavailable. Switch back to another model and confirm its controls return.
- Try invalid editor JSON, a missing prompt input and a disconnected prompt;
  verify the error and that no task was queued. Oversized or malformed JSON
  imports must keep the current settings draft.
- While ComfyUI is queued/running, close and reopen OhMyGame, change plugin
  settings, then Retry the original job. It must retrieve that same prompt ID
  without another queue submission or interruption of unrelated jobs.
- Stop local waiting and Retry. Simulate a temporary output-download failure;
  after recovery, Retry must download the existing result.
- Restart ComfyUI or clear its history after submission. Retry must report the
  missing task without silently starting a replacement. Reopen OhMyGame and
  confirm settings and the every-project switch are retained.

Automated tests use the actual host, sandbox and on-disk task receipts with a
simulated server. Real models, custom nodes and GPU execution need the local
acceptance above; no live ComfyUI service is accessed by the tests.

Protocol references: [official API examples](https://docs.comfy.org/development/comfyui-server/api-examples),
[server routes](https://docs.comfy.org/development/comfyui-server/comms_routes),
[history implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/execution.py).
See [NOTICE.md](NOTICE.md) for logo attribution and licensing.
