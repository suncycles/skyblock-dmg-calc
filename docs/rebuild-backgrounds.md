# Regenerating background images

`frontend/public/images/backgrounds/*.jpg` are single frames grabbed from the
original ALAND's Immersive Skyblock Modpack recordings (see Credits), cropped
to remove a black border baked into the source footage (an OBS export
artifact — width/height weren't quite the canvas size), then lightly blurred.
The original `.mp4` files are not kept in the repo.

If new zone footage needs to be added or an existing image redone (`ffmpeg`
required, `brew install ffmpeg`):

```bash
# 1. Check for a baked-in border. Seek/sample window must stay inside the
#    clip's real duration or cropdetect silently analyzes zero frames.
ffprobe -v error -show_entries format=duration -of csv=p=0 Source.mp4
ffmpeg -ss <10% of duration> -i Source.mp4 -t <70% of duration> \
  -vf "cropdetect=24:2:0" -f null - 2>&1 | grep -o "crop=[0-9:]*" | tail -1

# 2. Extract a frame, applying the detected crop (skip -vf crop if none was
#    found), scaling back to the native resolution, and a slight blur.
#    -strict unofficial works around an mjpeg encoder error some of these
#    clips hit ("Non full-range YUV is non-standard").
ffmpeg -ss 1 -i Source.mp4 \
  -vf "crop=<w>:<h>:<x>:<y>,scale=<nativeW>:<nativeH>:flags=lanczos,gblur=sigma=6" \
  -vframes 1 -q:v 3 -strict unofficial Output.jpg
```

`gblur=sigma=6` was used for 1080p sources, `sigma=4` for 720p ones (roughly
proportional). Always visually check the output — cropdetect's default
threshold missed a genuine border on at least one source clip (`Mythological.mp4`,
which needed a manually-tuned crop instead).

Then update the matching entry in `frontend/src/lib/background.js`.
