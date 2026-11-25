# Attribution

## Sprites

Sprites and captions come from the
[Pixel Art Atlas](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m)
dataset by Angais: 1,409,404 sprites of 16×16 pixels. Angais releases them
under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) "to the
extent of the rights Angais can waive". The dataset card adds that the
dedication "does not grant rights in third-party material, trademarks, or
Krea's models".

**Every sprite is AI-generated**, with Krea 2 Turbo and a pixel art LoRA. The
[Krea 2 Community License](https://www.krea.ai/krea-2-licensing) says Krea
claims no ownership of outputs (§5.3), limits commercial use of the model,
derivatives or outputs to those with under US$1,000,000 in yearly revenue
unless they hold an enterprise license (§2.3), and asks for AI-generated
content to be disclosed where a law or platform requires it (§4.3). It doesn't
say plainly whether its revenue limit binds people who later use outputs. The
dataset card says the release doesn't override that agreement. Check these
terms, and a store's rules on AI-generated content, before using the sprites
in a commercial game. Captions describe what the generator was asked for and
weren't reviewed; a sprite may differ from its caption.

This package bundles no sprites. It downloads the search data and the pages of
sprites a person looks at, and keeps them in its data folder.

## Search data and engine

The search data (term vectors, subjects, caption index, palette and pixel
pages) and `native/engine.mjs` come from the
[Pixel Search](https://huggingface.co/spaces/cfahlgren1/pixel-search) Space by
cfahlgren1, released under CC0 1.0, pinned to commit
`9687c39d60881ba80208e671ba12ac216019b1d0`. `native/engine.mjs` is its
`src/lib/search/engine.ts` compiled to JavaScript and otherwise unchanged. Its
notices say the term vectors were derived offline from BAAI/bge-base-en-v1.5
and BAAI/bge-large-en-v1.5 (MIT), thenlper/gte-base (MIT),
sentence-transformers/all-mpnet-base-v2 (Apache-2.0) and
mixedbread-ai/mxbai-embed-large-v1 (Apache-2.0), with a word list from
minishlab/potion-base-32M (MIT).

`assets/icon.svg` is original OhMyGame artwork. No affiliation with Angais,
cfahlgren1, Krea or Hugging Face is implied.
