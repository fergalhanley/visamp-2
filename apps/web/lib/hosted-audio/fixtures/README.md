# Synthetic MP3 fixtures

These recordings are generated sine waves, not third-party music.

```sh
ffmpeg -f lavfi -i 'sine=frequency=440:duration=2' -c:a libmp3lame -b:a 320k -metadata title='Test Recording' -metadata artist='Test Artist' -metadata album='Test Album' -metadata date=2026 tagged-cbr.mp3
ffmpeg -f lavfi -i 'sine=frequency=880:duration=3' -c:a libmp3lame -q:a 4 vbr.mp3
```

Tests do not require FFmpeg; it is only needed to regenerate these fixtures.
