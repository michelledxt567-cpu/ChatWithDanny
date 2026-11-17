# ChatWithDanny

Two simulated iPhone screen videos (plus a short Apple Watch clip that leads into video 2) about **Danny**, a friend who has gone silent. Both use an English iOS UI. They are shot as if you are looking at the protagonist's phone, with no screen-recording UI.

Both videos are 886×1920, 60 fps, H.264, with stereo Opus audio.

| File | Length | What it shows |
|---|---|---|
| [`output/video1_unlock_and_chat.mp4`](output/video1_unlock_and_chat.mp4) | 34.8 s | Unlock the phone, open WhatsApp, read back from Monday, type "I’m coming over to check on you." |
| [`output/video2_intro_apple_watch.mp4`](output/video2_intro_apple_watch.mp4) | 8.1 s | Apple Watch screen, played right before video 2: getting out of the car, the watch face, then the Compass app as the protagonist turns and walks toward the house. Uses the user's own sound file. |
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

## Japanese subtitle version (`output/日本語版/`)

| File | Length |
|---|---|
| [`output/日本語版/video1_unlock_and_chat_ja.mp4`](output/日本語版/video1_unlock_and_chat_ja.mp4) | 34.8 s |
| [`output/日本語版/video2_old_house_no_service_ja.mp4`](output/日本語版/video2_old_house_no_service_ja.mp4) | 30.3 s |

Same as the Chinese version, but the chat bubbles decode into casual Japanese (university friends: "w" for lol, サークル for the club). The decode effect, timing and audio are unchanged, and only message text is translated. It is turned on with `?ja` (the `JA` table in `src/translate.js`). The sandbox has no network access, so Noto Sans JP could not be downloaded. Japanese glyphs come from a 32 KB subset of the same Noto Sans SC font (`src/fonts/NotoSansSC-subset-ja.otf`). Kana are correct; a few kanji use the Simplified-Chinese glyph design, which differs from the Japanese design only in small stroke details.

```sh
cd src
node render.mjs ../work/jf1 60 --scene 'scene.html?ja' --workers 7
node render.mjs ../work/jf2 60 --scene 'scene2.html?ja' --workers 7
# audio + encode exactly as for the English versions
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
| 2.35–3.0 s | Swipe left into Camera. The night-mode viewfinder shows the old wooden Victorian house, modelled on the user's wireframe reference: a portico on panelled square columns with brackets, a dentilled cornice and a hanging lantern; arched double doors with glazed tops, lace curtains and a raised lower panel; a projecting clapboard wing on the left with a 6-over-6 window, gutters and downspouts; a tower on the right with a tall cusped window into a library (bookcases, chandelier, table lamp, drapes) over a panelled base; and a forecourt of old concrete slabs. The wood is weathered grey with patchy, peeling old white paint, mildew and grime; the door's dark green paint is worn through. November plants: dead grass in the paving joints and along the gravel strip, fallen maple leaves, a bare hydrangea, evergreen rhododendrons and ferns. No trees stand behind the house; above the roofs there is only a dark, overcast November night sky. The only light is the dim sky glow and a weak, distant sodium yard light, so the house is barely visible until the flash. |
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

## Apple Watch clip (before video 2)

`src/scene_watch.html` simulates an Apple Watch Series 10 (46 mm, display 208×248 pt) in a silver aluminium case with the black glass border, Digital Crown and side button. The watch is about 790 px wide and centred on black in the same 886×1920 frame as the phone videos, so the two clips can be joined directly. The sound is the user's file `Sounds SIMULATOR ZN.WAV`, trimmed to start at **1.25 s** (after the seat-belt sounds, about 0.3 s before the wrist comes up) and resampled to 48 kHz. Event times were measured from the sound file. In the clip below, file time = clip time + 1.25 s.

| Sound file | Clip | What happens |
|---|---|---|
| 1.58–1.88 s | 0.33–0.63 s | Wrist raised about 0.6 s before the door opens. The display wakes to the Modular face: **SAT 14**, **8:23**, heart rate **96 BPM**, activity rings, 36° weather, compass complication showing **SW**. |
| 2.18–2.29 s (door handle, door opens) | 0.93–1.04 s | The car door opens. |
| 2.79 s (light footstep) | 1.54 s | His first foot lands on the ground outside. |
| 2.97–3.38 s | 1.72–2.13 s | Right after, the compass complication is tapped and the Compass app zooms open, heading about 228° SW. |
| 4.75 s (door shut) | 3.50 s | He pushes the door shut; the reading jolts by a few degrees. |
| 5.40–5.90 s (first two footsteps) | 4.15–4.65 s | He walks forward along the car; the heading stays at about 228° SW. |
| 5.92–7.05 s | 4.67–5.80 s | Rounding the front of the car, he turns gradually over about three steps to **347° N** (toward the house). |
| 7.05–8.82 s (footsteps) | 5.80–7.57 s | Walking north toward the house; the dial sways a few degrees with each step. |
| 8.85 s | 7.60 s | He stops; the heading settles at 347–348°. |
| 9.05–9.30 s | 7.80–8.05 s | Wrist lowered, the display goes dark. The clip ends at 8.13 s on the dark watch, and video 2 starts from black. |

The watch shows 8:23 throughout, matching the 8:23 PM lock screen at the start of video 2. The Compass app shows **45°52′N 123°14′W, 690 ft** (≈ 45.864°N, 123.239°W): the Rock Creek valley along Keasey Rd, about 4 km west of Vernonia town centre (45.859°N, 123.189°W). The house is out in the forest, but its nearest town and postal address are still Vernonia. That is about 19 km north-north-west of the last dash cam position (N45.70512 W123.15156 at 7:50 PM).

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
# Apple Watch clip (uses the user's sound file, trimmed at 1.25 s)
node wavtrim.mjs '../Sounds SIMULATOR ZN.WAV' ../work/watch_audio.wav 1.25
node render.mjs ../work/fw 60 --scene scene_watch.html --workers 7
node encode.mjs ../work/fw ../output/video2_intro_apple_watch.mp4 ../work/watch_audio.wav
# optional playback check
node verify.mjs ../output/video2_old_house_no_service.mp4 ../work/check 1,5.95,30
```

- `src/phone.js` has the shared iOS parts: status bar, lock screen, home screen, and app launch.
- `src/scene.html` holds video 1 (`I` = intro timings, `MSGS`/`TIMES` = chat).
- `src/scene2.html` holds video 2 (`V` = timeline).
- `src/scene_watch.html` holds the Apple Watch clip (`EV` = timeline in sound-file seconds, `A0` = trim point).
- `src/photos.js` paints the older camera-roll photos procedurally (no network, so no stock photos were available).
- Each scene's `soundCues()` lists its sound effects.
