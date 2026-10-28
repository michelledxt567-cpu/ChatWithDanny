# ChatWithDanny

A simulated iPhone screen recording of a WhatsApp chat with **Danny** (English iOS UI).

**Video:** [`output/danny_whatsapp_screen_recording.mp4`](output/danny_whatsapp_screen_recording.mp4): 886×1920 (the size iOS saves screen recordings at), 60 fps, H.264, about 36 s, no audio.

## What happens in the recording

| Time | Action |
|---|---|
| 0.0–0.5 s | The recording starts the way iOS recordings do, with Control Center being swiped away. |
| 0.5–11.6 s | The chat starts scrolled up at **Monday**. The user reads through it with two slow swipes. All of the user's Monday messages have blue ✓✓, because Danny read them and replied. |
| 11.6–16 s | A swipe down to the end of the chat, with an iOS bounce. **Wednesday** and **Thursday** messages show grey ✓✓: delivered but never read. The header shows `last seen Monday at 11:52 AM` the whole time. |
| 16–30.7 s | The user taps the input box and the keyboard slides up. They type "Dan", stop, and delete it. Then they type `Im coming over to chekc on you`, and iOS autocorrect fixes it to "I’m" and "check". They switch to the 123 keys for the full stop. The status-bar clock changes from 6:40 to 6:41. |
| 30.7 s | The message is sent under a new **Today** separator. The clock icon changes to a single grey ✓: Danny's phone isn't receiving messages any more. |
| 31–36 s | The screen stays on the unanswered message. Control Center is pulled down to stop the recording. |

## Regenerating

The render sandbox has no network access, so everything uses tools already on the machine: Playwright-core, Chromium, and Chrome's WebCodecs H.264 encoder. Emoji are drawn as inline SVG because there is no emoji font.

```sh
cd src
node render.mjs ../work/frames 60      # scene.html -> JPEG frames
node encode.mjs ../work/frames ../output/danny_whatsapp_screen_recording.mp4
node verify.mjs ../output/danny_whatsapp_screen_recording.mp4 ../work/check 1,12,30   # optional playback check
```

All of the timings and messages are in `src/scene.html`: `MSGS`, `buildScript()`, `TIMES`, and `buildScroll()`.
