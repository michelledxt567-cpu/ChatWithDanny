# ChatWithDanny

Two simulated iPhone screen videos about **Danny**, a friend who has gone silent. Both use an English iOS UI. They are shot as if you are looking at the protagonist's phone, with no screen-recording UI.

Both videos are 886×1920, 60 fps, H.264, with stereo Opus audio.

| File | Length | What it shows |
|---|---|---|
| [`output/video1_unlock_and_chat.mp4`](output/video1_unlock_and_chat.mp4) | 38.9 s | Unlock the phone, open WhatsApp, read back from Monday, type "I’m coming over to check on you." |
| [`output/video2_old_house_no_service.mp4`](output/video2_old_house_no_service.mp4) | 36.2 s | 8:23 PM outside Danny's dad's old wooden house: flash photo, then WhatsApp. The signal drops from 3G to No Service, and both messages fail. |

## Video 1: unlock and chat

| Time | Action |
|---|---|
| 0.3 s | The side button wakes the lock screen: **Saturday, November 14, 6:40**, T-Mobile, Wi-Fi. Instagram and Snapchat notifications are showing. |
| 0.95–2.25 s | Face ID unlocks the phone, and a swipe up opens the home screen. The apps are ones popular with young people in the US/Europe: Instagram, TikTok, Snapchat, WhatsApp, YouTube, Netflix, Discord, Pinterest, BeReal., Spotify, and more. |
| 3.3–3.9 s | A tap on WhatsApp opens the app straight into the Danny chat. |
| 3.95–15 s | The chat starts at **Monday**, and the user reads through it. Monday's messages have blue ✓✓. |
| 15–19.5 s | A swipe down to the end. **Wednesday** and **Thursday** messages have grey ✓✓ (delivered, not read). The header says `last seen Monday at 11:52 AM` the whole time. |
| 19.5–34.2 s | The user starts typing "Dan" and deletes it. Then they type `Im coming over to chekc on you`, and autocorrect fixes "I’m" and "check". The clock changes from 6:40 to 6:41. |
| 34.2–38.9 s | The message is sent under **Today** with a single grey ✓ and stays unanswered. |

The chat and typing part is the same as in the first version. Only the intro was replaced: the Control Center open/close was removed.

## Video 2: the old house, no service

| Time | Action |
|---|---|
| 0.45 s | The lock screen wakes at **8:23 PM**: T-Mobile, **3G**, 2 bars, low battery (red). |
| 2.35–3.0 s | Swipe left into Camera. The night-mode viewfinder shows the old wooden porch with arched double doors. |
| 4.9 s | The signal drops to 1 bar. |
| 5.5 s | Flash is turned on ("FLASH ON"). |
| 6.6 s | The signal goes to **no bars, 3G disappears**. |
| 7.7–8.1 s | The shutter is pressed. A pre-flash fires, then the main flash lights up the porch, and the thumbnail updates. |
| 10.3–12.4 s | Swipe up back to the lock screen (now showing "No Service"). Face ID unlocks the phone, then swipe up to the home screen. The clock changes to 8:24. |
| 13.6 s | WhatsApp opens on the Danny chat, which ends with 6:41 PM "I’m coming over to check on you." (single ✓). |
| 16–20.1 s | The in-chat camera opens. The user picks the new photo from the strip; the preview shows Danny as recipient, and they tap send. |
| 21.9–25.9 s | The user types `Im here.` (autocorrect gives "I’m here.") and sends it. |
| ~29.5 s | The photo upload fails: red **!** and **Retry**. |
| ~32 s | "I’m here." fails with a red **!**. Danny's status stays `last seen Monday at 11:52 AM`. |

## Audio

There are no sample libraries available offline, so every sound is synthesized in `src/audio.mjs`:

- **Video 1** (indoor): quiet room tone with fridge hum and cars passing outside. Breathing and a sigh. Side-button click, swipes, taps, iOS keyboard clicks (letters, delete, and modifier keys sound different), and the WhatsApp send sound.
- **Video 2** (outdoor at night): wind gusts, leaves, distant traffic, a dog barking far away, a creaking porch board, shuffling feet. Nervous, shaky breathing. Side-button click, camera shutter, taps, swipes, and keyboard clicks.

## Regenerating

The sandbox has no network access. Rendering uses headless Chromium + WebGL (for the 3D house in `src/house3d.js`), and encoding uses Chrome's WebCodecs H.264/Opus with a small MP4 muxer.

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
node verify.mjs ../output/video2_old_house_no_service.mp4 ../work/check 1,8.13,36
```

- `src/phone.js` has the shared iOS parts: status bar, lock screen, home screen, and app launch.
- `src/scene.html` holds video 1 (`I` = intro timings, `MSGS`/`TIMES` = chat).
- `src/scene2.html` holds video 2 (`V` = timeline).
- Each scene's `soundCues()` lists its sound effects.
