# ChatWithDanny

Two simulated iPhone screen videos about **Danny**, a friend who has gone silent. Both use an English iOS UI. They are shot as if you are looking at the protagonist's phone, with no screen-recording UI.

Both videos are 886×1920, 60 fps, H.264, with stereo Opus audio.

| File | Length | What it shows |
|---|---|---|
| [`output/video1_unlock_and_chat.mp4`](output/video1_unlock_and_chat.mp4) | 34.8 s | Unlock the phone, open WhatsApp, read back from Monday, type "I’m coming over to check on you." |
| [`output/video2_old_house_no_service.mp4`](output/video2_old_house_no_service.mp4) | 30.3 s | 8:23 PM outside Danny's dad's old wooden house: flash photo, then WhatsApp. The signal drops from 3G to No Service, and both messages fail. |

## Chinese subtitle version (`output/中文版/`)

| File | Length |
|---|---|
| [`output/中文版/video1_unlock_and_chat_zh.mp4`](output/中文版/video1_unlock_and_chat_zh.mp4) | 34.8 s |
| [`output/中文版/video2_old_house_no_service_zh.mp4`](output/中文版/video2_old_house_no_service_zh.mp4) | 30.3 s |

These videos have the same content and timing as the English ones. The only difference is the chat message text. Each bubble first shows the original English. Shortly after it is fully on screen (0.7 s in video 1, 0.45 s in video 2), it decodes from left to right into Chinese. A short band of scrambled glyphs runs in front, like the translated NPC subtitles in Cyberpunk 2077. Bubbles that appear together decode one after another from top to bottom. After decoding, each bubble eases to the size of the Chinese text. The chat stays anchored while this happens, so the framing does not jump.

Only message text is translated. The iOS/WhatsApp UI stays English: day labels, "last seen", times, keyboard, the text being typed, and the lock screen. The translations and the effect are in `src/translate.js`, which is turned on by adding `?zh` to the scene URL. Chinese glyphs come from a 21 KB subset of Noto Sans SC (`src/fonts/`, SIL Open Font License).

```sh
cd src
node render.mjs ../work/zf1 60 --scene 'scene.html?zh' --workers 7
node render.mjs ../work/zf2 60 --scene 'scene2.html?zh' --workers 7
# audio + encode exactly as for the English versions (the timeline is identical)
```

## Video 1: unlock and chat

| Time | Action |
|---|---|
| 0.3 s | The side button wakes the lock screen: **Saturday, November 14, 6:40**, T-Mobile, Wi-Fi. Instagram and Snapchat notifications are showing. |
| 0.95–2.25 s | Face ID unlocks the phone, and a swipe up opens the home screen. The apps are ones popular with young people in the US/Europe: Instagram, TikTok, Snapchat, WhatsApp, YouTube, Netflix, Discord, Pinterest, BeReal., Spotify, and more. |
| 3.3–3.9 s | A tap on WhatsApp opens the app straight into the Danny chat. |
| 3.95–15 s | The chat starts at **Monday**, and the user reads through it. Monday's messages have blue ✓✓. |
| 15–19.5 s | A swipe down to the end. **Wednesday** and **Thursday** messages have grey ✓✓ (delivered, not read). The header says `last seen Monday at 11:52 AM` the whole time. |
| 19.5–30.1 s | The user starts typing "Dan", hesitates, and slowly deletes it (same pause as the first version). Then they type `Im coming over to chekc on you` at a fast two-thumb pace (about 8 keys/s, ~70 wpm), and autocorrect fixes "I’m" and "check". The clock changes from 6:40 to 6:41. |
| 30.1–34.8 s | The message is sent under **Today** with a single grey ✓ and stays unanswered. |

The chat content is the same as in the first version. The typing was sped up to a typical young person's pace, and the intro no longer has the Control Center open/close.

## Video 2: the old house, no service

| Time | Action |
|---|---|
| 0.45 s | The lock screen wakes at **8:23 PM**: T-Mobile, **3G**, 2 bars, low battery (red). |
| 2.35–3.0 s | Swipe left into Camera. The night-mode viewfinder shows the old wooden Victorian house, modelled on the user's wireframe reference: a portico on panelled square columns with brackets, a dentilled cornice and a hanging lantern; arched double doors with glazed tops, lace curtains and a raised lower panel; a projecting clapboard wing on the left with a 6-over-6 window, gutters and downspouts; a tower on the right with a tall cusped window into a library (bookcases, chandelier, table lamp, drapes) over a panelled base; and a forecourt of old concrete slabs. The wood is weathered grey with patchy, peeling old white paint, mildew and grime; the door's dark green paint is worn through. November plants: dead grass in the paving joints and along the gravel strip, fallen maple leaves, a bare hydrangea, evergreen rhododendrons and ferns, a bare maple and alder, and Douglas firs behind the house. |
| 3.8 s | The signal drops to 1 bar. |
| 4.3 s | Flash is turned on ("FLASH ON"). |
| 4.9 s | The signal goes to **no bars, 3G disappears**. |
| 5.6–6.0 s | The shutter is pressed. A pre-flash fires, then the main flash lights up the porch. The thumbnail slot, an empty grey square until now (the lock-screen camera can't show the photo library), shows the new photo. |
| 7.2–9.3 s | Swipe up back to the lock screen (now showing "No Service"). Face ID unlocks the phone, then swipe up to the home screen. The weather widget shows **Vernonia** (36°), a small timber town in the Coast Range about an hour from Portland, while video 1 at home shows Portland. The clock changes to 8:24. |
| 10.5 s | WhatsApp opens on the Danny chat, which ends with 6:41 PM "I’m coming over to check on you." (single ✓). |
| 12.9–15.9 s | The in-chat camera opens. The user picks the new photo from the strip, next to older camera-roll items (a payment screenshot, a döner kebab plate, a white samoyed, a beach, a sunset); the preview shows Danny as recipient, and they tap send. The preview screen is up for about 1.5 s. |
| 17.4–20.1 s | The user types `Im here.` (autocorrect gives "I’m here.") and sends it. |
| ~23.7 s | The photo upload fails: red **!** and **Retry**. |
| ~26.2 s | "I’m here." fails with a red **!**. Danny's status stays `last seen Monday at 11:52 AM`. |

## Audio

There are no sample libraries available offline, so every sound is synthesized in `src/audio.mjs`:

- **Video 1** (indoor): quiet room tone with fridge hum and cars passing outside. Breathing and a sigh. Side-button click, swipes, taps, iOS keyboard clicks (letters, delete, and modifier keys sound different), and the WhatsApp send sound.
- **Video 2** (outdoor at night): wind gusts, leaves, distant traffic, a dog barking far away, a creaking porch board, shuffling feet. Nervous, shaky breathing. Side-button click, camera shutter, taps, swipes, and keyboard clicks.

## Regenerating

The sandbox has no network access. Rendering uses headless Chromium + WebGL (for the 3D house in `src/house3d.js`: per-material shaders, baked sky occlusion, a shadowed sodium yard light, the phone's LED flash, light mist, and a phone-camera processing pass with tone mapping, sharpening, bloom and noise), and encoding uses Chrome's WebCodecs H.264/Opus with a small MP4 muxer.

```sh
cd src
# video 1
node render.mjs ../work/frames1 60 --scene scene.html
node audio.mjs ../work/frames1/meta.json ../work/audio1.wav indoor
node encode.mjs ../work/frames1 ../output/video1_unlock_and_chat.mp4 ../work/audio1.wav
# video 2
node render.mjs ../work/frames2 60 --scene scene2.html --workers 7
node audio.mjs ../work/frames2/meta.json ../work/audio2.wav outdoor
node encode.mjs ../work/frames2 ../output/video2_old_house_no_service.mp4 ../work/audio2.wav
# optional playback check
node verify.mjs ../output/video2_old_house_no_service.mp4 ../work/check 1,5.95,30
```

- `src/phone.js` has the shared iOS parts: status bar, lock screen, home screen, and app launch.
- `src/scene.html` holds video 1 (`I` = intro timings, `MSGS`/`TIMES` = chat).
- `src/scene2.html` holds video 2 (`V` = timeline).
- `src/photos.js` paints the older camera-roll photos procedurally (no network, so no stock photos were available).
- Each scene's `soundCues()` lists its sound effects.
