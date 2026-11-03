# Files image preview in Import

Owner requested real thumbnails for images selected through Files. Extend the existing
OTRCaptureFiles lease, without replacing original admission, parser, or save contracts.
Explicit preview may decode a selected local image before submission solely for display.
The original stream remains unopened until existing immutable intake registration.

Native ImageIO downsamples to 384px, emits at most 256KiB JPEG in memory, and skips
inputs above 20MiB. No provider path, cache file, Source, network, or original bytes
are returned to JS. previewUri is Draft/Transient display metadata only, not a payload.
Removal/account invalidation retains the existing lease lifecycle; stale preview results
are discarded and leases released. Older native hosts or failed previews retain the
named card fallback. This requires a Native rebuild, not just a JS bundle update.

Validation: real Swift ImageIO decode, dimensions, original bytes unchanged, stream not
opened by preview, expired lease and corrupt file fallback; JS adapter/staging/Composer
tests. iPad picker/visual validation remains required. No Cloud contract change.
