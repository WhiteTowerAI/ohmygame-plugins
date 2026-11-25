# Hyper3D

Optional Beta for your own Hyper3D API account. Requires OhMyGame with plugin API 2.16.

On 2026-11-25 the Rodin web workspace fetched a confirmed model GLB from `file.hyper3d.com` (HTTP 200). The manifest allows this file host and `api.hyper3d.com`. Before publication, verify the GLB hostname in a real response from `POST /api/v2/download`.

## Features

- All ten existing Rodin tiers, editable model versions and defaults.
- Text and image generation with up to five PNG/JPEG references totaling at most 20 MB.
- Texture one source GLB using one reference image and an optional prompt.
- Face count, textures, PBR and pose options; read-only account balance.
- Durable paid submission, independent status/download identifiers, throttling delays and fresh download links after restart.

The API key account is independent from OhMyGame free-cloud Hyper3D. Local Stop does not cancel the vendor job. An unconfirmed submission is retained; check the vendor dashboard before deliberately creating another job.

## Local acceptance before native cutover

After the publication hold is cleared, install the Beta, configure your own API key, and enable it for every project. Test text and multi-image generation, texture replacement, model defaults and a custom tier, and balance. Exit while generating and reopen to recover the same job; check the Hyper3D dashboard for a single paid submission. Retry a failed download after reopening and verify a fresh signed link is obtained. Never share keys or signed URLs in reports.

[API documentation](https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5)
