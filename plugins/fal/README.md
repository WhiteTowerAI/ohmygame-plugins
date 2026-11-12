# fal.ai

Adds fal.ai to OhMyGame's Settings → Providers, with your own API key, for
pictures, videos, audio and 3D models. It has no chat models.

- API key: From fal.ai → Dashboard → Keys.

| Kind | Model | What it takes |
| --- | --- | --- |
| Image | FLUX.1 [schnell] (`fal-ai/flux/schnell`) | A prompt, in 1:1, 4:3, 3:4, 16:9 or 9:16 |
| Video | Kling O3 (`fal-ai/kling-video/o3/standard/image-to-video`) | A first frame, an optional last frame, and 3, 5, 10 or 15 seconds |
| Speech | MiniMax Speech-02 HD (`fal-ai/minimax/speech-02-hd`) | Up to 5,000 characters, in one of MiniMax's voices, as MP3 |
| Sound effects, music | Stable Audio (`fal-ai/stable-audio`) | A description and up to 47 seconds, as WAV |
| 3D | TRELLIS (`fal-ai/trellis`) | One picture of the object, as GLB |

Every request goes through fal.ai's queue, in
[`media/adapter.js`](media/adapter.js). OhMyGame runs that script in a sandbox:
it reaches only `queue.fal.run` and the hosts fal.ai's files are on, and
OhMyGame adds the key to its requests. A video, audio file or 3D model a
restart cut off is checked again on **Retry**, not paid for twice. fal.ai bills
each request to your account.

Needs OhMyGame with plugin API 2.5.0 or later.

Published as `@ohmygame/fal` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
