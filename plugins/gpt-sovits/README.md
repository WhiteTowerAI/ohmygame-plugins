# GPT-SoVITS Beta

An optional speech provider for an existing local GPT-SoVITS server. Requires
OhMyGame plugin API **2.32+** (current `dev`). The plugin
uses your server's currently loaded model and one configured reference voice.
It does not install Python, models or custom dependencies.

## Set up

1. Install and run [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) separately.
   Start its `api_v2.py` on **http://127.0.0.1:9880**, using its documented command:
   `python api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer.yaml`.
   Confirm that the same reference and text work in your server first.
2. Prepare a clean 3–10 second reference audio clip on the server's filesystem
   and its exact transcript. Use a voice you have permission to use. In plugin
   Settings, enter its **absolute path**, transcript and reference language.
   The plugin passes a path to the server; it does not upload or read the file
   itself. V3/V4/V5 require a transcript, so this Beta always requires one.
3. Choose the default text language: `auto`, `zh`, `en` or `ja`. Reference
   language is `zh`, `en` or `ja`. Explicit request languages override the text
   default; common tags such as `zh-CN` and `en-US` map to their base language.
4. Save, allow the exact local network destination and enable the plugin for
   every project. Choose **GPT-SoVITS** on an audio node.
   Enter the words to speak. Output is WAV, with up to 2,000 text characters
   per request; reference transcripts have the same limit. Speed runs from
   half speed (-50) to double speed (100).

No API key or callback setup is required. The server must already have its
model loaded. The plugin never calls its global weight/reference switching or
restart endpoints. It does not support voice training, reference uploads,
multi-speaker mixing, streaming playback, LAN/custom-port/authenticated servers,
music, sound effects or transcription. The integration icon is original artwork;
see [NOTICE.md](NOTICE.md).

## Recovery and limits

The host saves a per-job snapshot of the reference path, transcript and language
before `POST /tts`. Changing or clearing settings cannot change that snapshot.
This pins **settings**, not the file's contents or the server's loaded weights:
do not replace the reference file or change server models while work is pending.

A completed response is saved as a durable file. Retrying after an import
failure or reopening the app can reuse that result without synthesizing again.
This API has no task ID, status or history lookup. If Stop, shutdown, timeout or
a connection failure interrupts an unconfirmed response, Retry reports that
uncertainty instead of resending the synthesis. It cannot retrieve a result the
server never delivered. After checking the server, start a new generation
explicitly if you want another attempt. Stop never calls a global server action;
the server owns the in-flight inference and its cleanup.

The host allows up to five minutes for the synchronous request and up to 64 MiB
of audio. Slow hardware or long text can exceed this; start with a short phrase.
A saved error response is replayed too. After fixing settings or server errors,
start a **new** job; Retry intentionally retains the original settings/response.
Keep the original plugin version for a staged retry if an upgrade changes the
submission contract. Existing jobs without this binding keep their prior behavior.

## Local acceptance

- Confirm logo/Beta, save the reference settings, restart OhMyGame and check
  their values and the every-project switch remain.
- Generate short Chinese, English and Japanese phrases supported by your
  model; check that the words, chosen reference voice and WAV playback are right.
  Test default language versus an explicit request language and the speed control.
- Try a missing file, incorrect reference transcript and unsupported language;
  errors should remain visible, without repeatedly sending a request. API/runtime
  errors require a new generation after correction.
- After a confirmed response, retry a failed import and reopen/retry the same
  task; the server should receive no second `/tts`. During a slow synthesis,
  change settings and verify the request already sent is unchanged.
- Interrupt an in-flight response or stop/reopen while generating. Confirm Retry
  does not issue another `/tts` or promise remote task recovery. Check the server
  before explicitly starting a new job.

Automated tests use the actual host, sandbox, settings and disk receipts with a
simulated server and synthetic WAV. They do not verify GPU/model execution or
voice quality. No real profile, model or reference audio is changed by tests.

Contract evidence (checked 2026-11-16): upstream
[`api_v2.py`](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/api_v2.py)
blob `36891ed2ba3972801d45b8ad8e4d0b3eb0bd2f5b`, and
[`TTS.py`](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/GPT_SoVITS/TTS_infer_pack/TTS.py)
blob `7a7f200e228c2432bfd1c02154fb4eb18e1904a5`.
