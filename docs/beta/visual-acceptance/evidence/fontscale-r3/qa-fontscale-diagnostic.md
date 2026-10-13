# Transient r3 font-scale diagnostic

Actual OS baseline1; five increases produced1.118,1.235,1.353,1.786,2.143 in useWindowDimensions, Dimensions.get(window), and PixelRatio alike. The >2 flag became true and Shell visibly switched to its large row. Hot clipping persisted in native heading, body, button and Shell Text. Ordinary Cmd-R returned Today; normal MyTrips reopen at the unchanged2.143 showed identical marker numbers and readable layout. Five decreases reversed the same values to1. The temporary marker used non-scaling Text for readability; it is diagnostic, not a production screenshot. Product/fixture mutation is confined to the owned clone. MyTripsList restored byte-exact; all11 r3 hashes pass. This rules out missing hook delivery for this observed case, while stale native Text measurement is an inference, not a confirmed underlying RN root cause.

Actual diagnostic PNGs: docs/beta/visual-acceptance/assets/qa-fontscale-r3-baseline.png; qa-fontscale-r3-hot-five.png; qa-fontscale-r3-reload-five.png. Numeric log: qa-fontscale-log.json. No new Actor/right, persistent data, install or production edit.


[Baseline PNG](docs/beta/visual-acceptance/assets/qa-fontscale-r3-baseline.png), [hot five-step PNG](docs/beta/visual-acceptance/assets/qa-fontscale-r3-hot-five.png), [same-scale reload PNG](docs/beta/visual-acceptance/assets/qa-fontscale-r3-reload-five.png), [numeric log](qa-fontscale-log.json).
