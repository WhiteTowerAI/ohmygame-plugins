# Fish Audio (Beta)

An optional connection to the official Fish Audio API. Requires OhMyGame plugin
API **2.25** (current `dev`). It offers **S2.1 Pro** and **S2.1 Pro Free** for
single-speaker speech, with voice search, speed control and mono MP3/WAV output.
Availability and quota depend on your Fish Audio account and chosen model.

## Connect

1. Create an API key in the [Fish Audio dashboard](https://fish.audio/).
2. Install Fish Audio from Plugins and enter the key in its settings.
3. Enable the plugin. Create an Audio node, choose Speech, then a Fish Audio model.
4. Choose a voice in the voice picker.
   Your workspace voices are listed first; public voices follow. Search applies
   to both lists. The node saves your chosen voice; this first Beta does not
   create a separate global default voice.
5. Enter the words to speak and generate. The result is saved through the normal
   OhMyGame Library/canvas flow. Choose MP3 or WAV in audio settings if needed.

The key stays in the host's credential store and only reaches `api.fish.audio`.
Voice browsing uses authenticated GET requests. Synthesis uses the selected
model explicitly, so an unknown model cannot silently fall back to a paid one.
Generated audio is collected as a complete file; this is not live playback.

Confirmed response files can be recovered after restart without resubmission.
If the app loses a response after submission, it reports the uncertain result
instead of automatically submitting again. Changing the account, prompt or
model cannot reuse another request's receipt.

Voice creation/cloning uploads, multi-speaker dialogue, transcription, music,
sound effects and real-time playback are outside this first release. Agent audio requests can also use an existing Fish voice ID directly, without
creating or uploading voices from OhMyGame. The canvas picker currently offers
listed voices and retains a saved voice ID even when it is outside the loaded page.

## Local acceptance

Use current `dev`, or a release advertising plugin API 2.25 or later. Before
publication, install this folder via Plugins → Add plugin → This computer with
Develop enabled.

- Confirm the Fish Audio logo and Beta badge, enable it and save an API key.
- Select a workspace/public voice, search in Chinese/English and load another
  page. The chosen voice should stay selected after save/reopen, including when
  it is outside the loaded page.
- Generate a short Chinese line and an English line. Check the words, voice,
  playback and saved Library/canvas asset. Compare 1× and a slower speed.
- Generate MP3 at 44.1 kHz and WAV at 16 kHz; verify both play and export.
- If your account supports S2.1 Pro Free, explicitly select it and verify it;
  quota/model-access errors should be readable and must not switch to Pro.
- Reopen the project and verify model, voice and output settings. Quit during a
  generation: either recover a confirmed result or show the uncertain response;
  it must not silently start a second billable request.
- Disable/re-enable the plugin and confirm settings remain. Do not erase real
  credentials merely to test error handling; automated tests use mock responses.

Automated tests exercise the actual sandbox/host with synthetic audio and
mocked HTTP, including errors, pagination, account isolation and response
recovery. They do not establish live service availability or speech quality.

## Official contracts

Checked 2026-11-15:

- [TTS request and formats](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Voice model listing](https://docs.fish.audio/api-reference/endpoint/model/list-models)
- [Canonical OpenAPI](https://api.fish.audio/openapi.json)

The icon is from the official documentation; see [asset source](assets/README.md).
