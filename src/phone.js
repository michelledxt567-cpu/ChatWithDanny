// Shared iOS system UI: status bar, lock screen, home screen, app-launch zoom, app icons.
// All coordinates are iPhone 15 points (393 x 852) inside #screen.
(function () {
  const W = 393, H = 852;
  const css = `
  @font-face { font-family: "LockClock"; src: url("file:///inner_container/usr/share/fonts/google-noto/NotoSans-SemiCondensedSemiBold.ttf"); }
  .wp { position:absolute; inset:0; background:
      radial-gradient(120% 60% at 15% 8%, #2b3f73 0%, rgba(43,63,115,0) 60%),
      radial-gradient(90% 55% at 95% 40%, #b0577a 0%, rgba(176,87,122,0) 60%),
      radial-gradient(110% 60% at 20% 95%, #e08a4f 0%, rgba(224,138,79,0) 55%),
      radial-gradient(80% 50% at 80% 90%, #6c3f8f 0%, rgba(108,63,143,0) 60%),
      linear-gradient(180deg, #141d3a 0%, #3b2c5c 45%, #7a4767 75%, #c06e55 100%); }
  #sbar { position:absolute; left:0; top:0; width:${W}px; height:54px; z-index:50; pointer-events:none; }
  #sbClock { position:absolute; left:0; width:108px; top:15px; text-align:center; font-size:17px; font-weight:600; letter-spacing:-0.2px; }
  #sbCarrier { position:absolute; left:0; width:122px; top:16px; text-align:center; font-size:15.5px; font-weight:600; letter-spacing:-0.2px; }
  #sbRight { position:absolute; right:26px; top:19px; height:14px; display:flex; gap:6px; align-items:center; }
  #sbNet { font-size:15px; font-weight:600; letter-spacing:-0.3px; line-height:14px; }
  #homeind { position:absolute; left:129.5px; bottom:8px; width:134px; height:5px; border-radius:3px; z-index:55; }
  #blackout { position:absolute; inset:0; background:#000; z-index:90; pointer-events:none; }

  #lock { position:absolute; inset:0; z-index:20; overflow:hidden; color:#fff; }
  #lkPad { position:absolute; left:${W / 2 - 14}px; top:44px; width:28px; height:28px; }
  #lkDate { position:absolute; left:0; right:0; top:86px; text-align:center; font-size:20px; font-weight:600; color:rgba(255,255,255,.86); letter-spacing:-0.1px; }
  #lkTime { position:absolute; left:0; right:0; top:102px; text-align:center; font-family:"LockClock","Noto Sans"; font-size:108px; font-weight:600; line-height:1.05; letter-spacing:-2px; color:rgba(255,255,255,.93); }
  #lkNotifs { position:absolute; left:10px; right:10px; top:568px; }
  .nt { position:relative; height:68px; margin-bottom:8px; border-radius:22px; background:rgba(245,245,250,.42);
        backdrop-filter: blur(24px) saturate(160%); overflow:hidden; }
  .nt .ic { position:absolute; left:12px; top:14px; width:40px; height:40px; border-radius:10px; overflow:hidden; }
  .nt .ti { position:absolute; left:62px; top:13px; font-size:15px; font-weight:600; color:#111; letter-spacing:-0.2px; }
  .nt .bd { position:absolute; left:62px; top:34px; right:14px; font-size:15px; color:#111; letter-spacing:-0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .nt .tm { position:absolute; right:14px; top:14px; font-size:13px; color:rgba(30,30,40,.6); }
  .lkBtn { position:absolute; top:744px; width:50px; height:50px; border-radius:50%; background:rgba(20,20,30,.38);
           backdrop-filter: blur(20px); display:flex; align-items:center; justify-content:center; }
  #lkHint { position:absolute; left:0; right:0; top:808px; text-align:center; font-size:15px; color:rgba(255,255,255,.85); letter-spacing:-0.1px; }

  #hs { position:absolute; inset:0; z-index:10; overflow:hidden; color:#fff; }
  #hsWp { filter: brightness(.86); }
  #hsC { position:absolute; inset:0; transform-origin: 50% 45%; }
  .app { position:absolute; width:62px; height:62px; }
  .app .ico { width:62px; height:62px; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.18); }
  .app .lb { position:absolute; left:-14px; width:90px; top:67px; text-align:center; font-size:11.5px; color:#fff; letter-spacing:-0.1px;
             text-shadow:0 0 3px rgba(0,0,0,.25); white-space:nowrap; }
  .badge { position:absolute; top:-7px; right:-9px; min-width:22px; height:22px; padding:0 6px; border-radius:11px; background:#FF3B30;
           color:#fff; font-size:13px; font-weight:600; line-height:22px; text-align:center; }
  .wd { position:absolute; width:153px; height:153px; border-radius:22px; overflow:hidden; }
  .wdl { position:absolute; width:153px; text-align:center; font-size:11.5px; color:#fff; text-shadow:0 0 3px rgba(0,0,0,.25); }
  #hsSearch { position:absolute; left:${W / 2 - 42}px; top:704px; width:84px; height:30px; border-radius:15px; background:rgba(255,255,255,.24);
              backdrop-filter: blur(20px); display:flex; align-items:center; justify-content:center; gap:5px; font-size:13.5px; font-weight:500; }
  #hsDock { position:absolute; left:11px; right:11px; top:748px; height:88px; border-radius:34px; background:rgba(255,255,255,.26); backdrop-filter: blur(30px) saturate(150%); }

  #launchclip { position:absolute; left:0; top:0; width:${W}px; height:${H}px; overflow:hidden; z-index:15; }
  #app { position:absolute; left:0; top:0; width:${W}px; height:${H}px; transform-origin:0 0; overflow:hidden; }
  #launchIcon { position:absolute; inset:0; z-index:100; display:none; }
  #launchIcon svg { width:100%; height:100%; }
  `;

  // ---------------- icons ----------------
  let uid = 0;
  const squircle = (inner, defs = '') => `<svg viewBox="0 0 60 60" width="100%" height="100%" preserveAspectRatio="none"><defs>${defs}</defs>${inner}</svg>`;
  const ICONS = {
    instagram: () => { const g = 'ig' + (uid++); return squircle(`<rect width="60" height="60" fill="url(#${g})"/>
      <rect x="15" y="15" width="30" height="30" rx="9" fill="none" stroke="#fff" stroke-width="3.6"/>
      <circle cx="30" cy="30" r="7.2" fill="none" stroke="#fff" stroke-width="3.6"/><circle cx="38.6" cy="21.4" r="2.1" fill="#fff"/>`,
      `<radialGradient id="${g}" cx="0.28" cy="1.05" r="1.25"><stop offset="0" stop-color="#FFD55A"/><stop offset="0.12" stop-color="#FFD55A"/><stop offset="0.48" stop-color="#FF4B3E"/><stop offset="0.75" stop-color="#E0368C"/><stop offset="1" stop-color="#8A3AC8"/></radialGradient>`); },
    tiktok: () => { const n = 'M33 14h5c.6 4 3.4 7 7.5 7.4v5.2c-2.8 0-5.3-.9-7.5-2.4v11.6c0 6-4.8 10.6-10.6 10.6S16.8 41.8 16.8 36c0-5.8 4.8-10.4 10.6-10.4.6 0 1.1 0 1.6.1v5.4c-.5-.2-1-.3-1.6-.3-2.8 0-5.2 2.3-5.2 5.2s2.3 5.2 5.2 5.2c2.9 0 5.4-2.3 5.4-5.2Z';
      return squircle(`<rect width="60" height="60" fill="#000"/><path d="${n}" fill="#25F4EE" transform="translate(-1.4 -1.2)"/><path d="${n}" fill="#FE2C55" transform="translate(1.4 1.2)"/><path d="${n}" fill="#fff"/>`); },
    snapchat: () => squircle(`<rect width="60" height="60" fill="#FFFC00"/><path d="M30 13c6.5 0 10.5 4.6 10.5 10.4 0 1.6-.1 3.2-.2 4.4.9.5 2.2.2 3-.2 1-.4 2 .6 1.4 1.6-.8 1.2-3 1.6-4.2 2.2-.6.3-.6 1-.3 1.6 1.5 3 4 5.2 7 6 .8.2.9 1.2.2 1.6-1.6.9-3.6 1-4.6 1.4-.6.3-.4 1.6-1 2-1.2.6-3-.4-5.2.2-1.8.5-3 2.6-6.6 2.6s-4.8-2.1-6.6-2.6c-2.2-.6-4 .4-5.2-.2-.6-.4-.4-1.7-1-2-1-.4-3-.5-4.6-1.4-.7-.4-.6-1.4.2-1.6 3-.8 5.5-3 7-6 .3-.6.3-1.3-.3-1.6-1.2-.6-3.4-1-4.2-2.2-.6-1 .4-2 1.4-1.6.8.4 2.1.7 3 .2-.1-1.2-.2-2.8-.2-4.4C19.5 17.6 23.5 13 30 13Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>`),
    whatsapp: () => { const g = 'wa' + (uid++); return squircle(`<rect width="60" height="60" fill="url(#${g})"/>
      <path d="M30 13.2a16.6 16.6 0 0 0-14.4 24.9L13.4 46.6l8.7-2.3A16.6 16.6 0 1 0 30 13.2Z" fill="none" stroke="#fff" stroke-width="3"/>
      <path d="M24.3 22.2c.5-.5 1.3-.5 1.7.1l1.8 2.7c.3.5.3 1.1-.1 1.5l-1 1c.9 2 2.5 3.6 4.5 4.5l1-1c.4-.4 1-.5 1.5-.1l2.7 1.8c.6.4.6 1.2.1 1.7l-1.3 1.3c-1 1-2.6 1.2-3.9.5-3.3-1.8-6-4.5-7.8-7.8-.7-1.3-.5-2.9.5-3.9Z" fill="#fff"/>`,
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5FFA7B"/><stop offset="1" stop-color="#25C03B"/></linearGradient>`); },
    youtube: () => squircle(`<rect width="60" height="60" fill="#fff"/><rect x="10" y="17" width="40" height="27" rx="8" fill="#FF0000"/><path d="M26 23.6 36.4 30.5 26 37.4Z" fill="#fff"/>`),
    netflix: () => squircle(`<rect width="60" height="60" fill="#000"/><path d="M19 12h6.5L35 37.5V12h6.5v36.5c-2.2-.3-4.4-.5-6.5-.6L25 22.6V48c-2.1.2-4.4.4-6 .7Z" fill="#E50914"/><path d="M19 12h6.5L35 37.5v10.4L25 22.6Z" fill="#B1060F"/>`),
    discord: () => squircle(`<rect width="60" height="60" fill="#5865F2"/><path d="M41.5 19.5a28 28 0 0 0-7-2.2l-.9 1.8a26 26 0 0 0-7.2 0l-.9-1.8a28 28 0 0 0-7 2.2C14 26.3 12.8 33 13.4 39.6a28 28 0 0 0 8.6 4.3l1.8-2.9a18 18 0 0 1-2.9-1.4l.7-.5a20 20 0 0 0 17.2 0l.7.5a18 18 0 0 1-2.9 1.4l1.8 2.9a28 28 0 0 0 8.6-4.3C47.7 32 46 25.4 41.5 19.5Z" fill="#fff"/><ellipse cx="24.6" cy="33" rx="2.9" ry="3.2" fill="#5865F2"/><ellipse cx="35.4" cy="33" rx="2.9" ry="3.2" fill="#5865F2"/>`),
    pinterest: () => squircle(`<rect width="60" height="60" fill="#fff"/><circle cx="30" cy="30" r="20" fill="#E60023"/><path d="M30.6 18c-7 0-10.6 5-10.6 9.2 0 2.5 1 4.8 3 5.6.3.1.6 0 .7-.4l.3-1.2c.1-.4 0-.5-.2-.8-.6-.7-1-1.6-1-2.9 0-3.7 2.8-7.1 7.3-7.1 4 0 6.2 2.4 6.2 5.7 0 4.3-1.9 7.9-4.7 7.9-1.6 0-2.7-1.3-2.4-2.9.4-1.9 1.3-4 1.3-5.4 0-1.2-.7-2.3-2.1-2.3-1.6 0-2.9 1.7-2.9 3.9 0 1.4.5 2.4.5 2.4l-1.9 8.2c-.6 2.4-.1 5.4 0 5.7 0 .2.3.2.4.1.2-.2 2.2-2.8 2.9-5.4l1.1-4.4c.6 1.1 2.2 2 3.9 2 5.2 0 8.7-4.7 8.7-11C41 22.5 36.9 18 30.6 18Z" fill="#fff"/>`),
    spotify: () => squircle(`<rect width="60" height="60" fill="#121212"/><circle cx="30" cy="30" r="20" fill="#1ED760"/><path d="M19 25.2q11-4 22.4 1.6" stroke="#121212" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M20.6 31.2q9.6-3 18.6 1.3" stroke="#121212" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M22.2 36.9q7.6-2.2 14.6 1" stroke="#121212" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
    messages: () => { const g = 'ms' + (uid++); return squircle(`<rect width="60" height="60" fill="url(#${g})"/><ellipse cx="30" cy="28.5" rx="17" ry="14"/><path d="M17.5 36.5q-.8 5-5 7.5 6.5.4 10.5-3.5Z" fill="#fff"/><ellipse cx="30" cy="28.5" rx="17" ry="14" fill="#fff"/>`,
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#65F67F"/><stop offset="1" stop-color="#0DBD2B"/></linearGradient>`); },
    phone: () => { const g = 'ph' + (uid++); return squircle(`<rect width="60" height="60" fill="url(#${g})"/><path d="M21.3 15.6c1-1 2.6-.9 3.4.2l3.4 4.8c.6.9.5 2.1-.2 2.9l-2 2c1.7 3.7 4.7 6.7 8.4 8.4l2-2c.8-.7 2-.8 2.9-.2l4.8 3.4c1.1.8 1.2 2.4.2 3.4l-2.4 2.4c-1.9 1.9-4.9 2.3-7.3 1C28.3 40.5 23 35.2 19.6 29c-1.3-2.4-.9-5.4 1-7.3Z" fill="#fff"/>`,
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#65F67F"/><stop offset="1" stop-color="#0DBD2B"/></linearGradient>`); },
    safari: () => { const g = 'sf' + (uid++); let ticks = ''; for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18; ticks += `<line x1="${30 + 19.5 * Math.cos(a)}" y1="${30 + 19.5 * Math.sin(a)}" x2="${30 + (i % 3 ? 17.8 : 16.6) * Math.cos(a)}" y2="${30 + (i % 3 ? 17.8 : 16.6) * Math.sin(a)}" stroke="#fff" stroke-width=".7" opacity=".8"/>`; }
      return squircle(`<rect width="60" height="60" fill="#fff"/><circle cx="30" cy="30" r="22" fill="url(#${g})"/>${ticks}<path d="M42 18 32.4 32.4 27.6 27.6Z" fill="#FF3B30"/><path d="M18 42 27.6 27.6 32.4 32.4Z" fill="#fff"/>`,
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19D7FF"/><stop offset="1" stop-color="#1E5CF0"/></linearGradient>`); },
    photos: () => { const c = ['#FFB800', '#FF7A00', '#FF3D5A', '#C64CD9', '#5A63EE', '#16A2F2', '#21C59C', '#8FD640']; let p = '';
      c.forEach((col, i) => { p += `<ellipse cx="30" cy="19.5" rx="6.3" ry="10.5" fill="${col}" opacity=".82" transform="rotate(${i * 45} 30 30)" style="mix-blend-mode:multiply"/>`; });
      return squircle(`<rect width="60" height="60" fill="#fff"/>${p}`); },
    camera: () => { const g = 'cm' + (uid++); return squircle(`<rect width="60" height="60" fill="url(#${g})"/><path d="M14 22h7.5l3-4.2h11l3 4.2H46a3 3 0 0 1 3 3v15.5a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V25a3 3 0 0 1 3-3Z" fill="#3A3A3C"/><circle cx="30" cy="32.5" r="8" fill="#1C1C1E" stroke="#8E8E93" stroke-width="2"/><circle cx="30" cy="32.5" r="3.4" fill="#2C2C55"/><circle cx="43" cy="26" r="1.4" fill="#FFCC00"/>`,
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EDEDF0"/><stop offset="1" stop-color="#A4A4AA"/></linearGradient>`); },
    maps: () => squircle(`<rect width="60" height="60" fill="#fff"/><path d="M0 60V36l24 24Z" fill="#1A73E8"/><path d="M0 20 40 60h14L0 6Z" fill="#E8EAED"/><path d="M60 0v24L36 0Z" fill="#FBBC04"/><path d="M0 0h22L0 22Z" fill="#34A853"/><path d="M60 60H46l14-14Z" fill="#34A853"/>
      <path d="M31 12a11 11 0 0 0-11 11c0 8.3 11 22 11 22s11-13.7 11-22a11 11 0 0 0-11-11Z" fill="#EA4335"/><circle cx="31" cy="23" r="4" fill="#A50E0E"/>`),
    gmail: () => squircle(`<rect width="60" height="60" fill="#fff"/><path d="M11 20v22a2 2 0 0 0 2 2h6V27Z" fill="#4285F4"/><path d="M49 20v22a2 2 0 0 1-2 2h-6V27Z" fill="#34A853"/><path d="M11 20c0-3.2 3.6-5 6.2-3.1L30 26.4l12.8-9.5C45.4 15 49 16.8 49 20l-8 7-11 8.2L19 27Z" fill="#EA4335"/><path d="M41 18.4l1.8-1.5C45.4 15 49 16.8 49 20l-8 7Z" fill="#FBBC04"/><path d="M11 20c0-3.2 3.6-5 6.2-3.1L19 18.4V27Z" fill="#C5221F"/>`),
    uber: () => squircle(`<rect width="60" height="60" fill="#000"/><text x="30" y="35.5" text-anchor="middle" font-family="Noto Sans" font-weight="500" font-size="15" fill="#fff" letter-spacing="-0.3">Uber</text>`),
    venmo: () => squircle(`<rect width="60" height="60" fill="#3D95CE"/><path d="M40.5 14.5c1 1.7 1.5 3.4 1.5 5.6 0 7-6 16.1-10.9 22.5H20L15.6 17.3l9.3-.9 2.3 18.3c2.1-3.5 4.7-9 4.7-12.7 0-2-.3-3.4-.9-4.6Z" fill="#fff"/>`),
    bereal: () => squircle(`<rect width="60" height="60" fill="#000"/><text x="30" y="34.5" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="12.5" fill="#fff" letter-spacing="-0.4">BeReal.</text>`),
    settings: () => { const g = 'st' + (uid++); let teeth = ''; for (let i = 0; i < 12; i++) teeth += `<rect x="27.6" y="9.5" width="4.8" height="8" rx="1.2" fill="#636366" transform="rotate(${i * 30} 30 30)"/>`;
      return squircle(`<rect width="60" height="60" fill="url(#${g})"/>${teeth}<circle cx="30" cy="30" r="15.5" fill="#636366"/><circle cx="30" cy="30" r="11.5" fill="#D1D1D6"/><circle cx="30" cy="30" r="5" fill="#636366"/>`,
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5E5EA"/><stop offset="1" stop-color="#A0A0A6"/></linearGradient>`); },
  };

  const GRID = [
    ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['snapchat', 'Snapchat'], ['whatsapp', 'WhatsApp'],
    ['youtube', 'YouTube'], ['netflix', 'Netflix'], ['discord', 'Discord'], ['pinterest', 'Pinterest'],
    ['photos', 'Photos'], ['camera', 'Camera'], ['maps', 'Google Maps'], ['gmail', 'Gmail'],
    ['uber', 'Uber'], ['venmo', 'Venmo'], ['bereal', 'BeReal.'], ['settings', 'Settings'],
  ];
  const DOCK = ['phone', 'safari', 'messages', 'spotify'];
  const COLX = [27, 118, 209, 300], ROWY = [268, 366, 464, 562];
  const RECT = {};

  // ---------------- status bar pieces ----------------
  function barsSVG(n, color) {
    const xs = [0, 5, 10, 15], ys = [8, 5.5, 3, 0], hs = [4, 6.5, 9, 12];
    return `<svg width="19" height="12" viewBox="0 0 19 12">${xs.map((x, i) => `<rect x="${x}" y="${ys[i]}" width="3.2" height="${hs[i]}" rx="1" fill="${color}" opacity="${i < n ? 1 : 0.3}"/>`).join('')}</svg>`;
  }
  const wifiSVG = (c) => `<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.2C14 1.6 11.4.5 8.5.5S3 1.6 1 3.6l1.2 1.2C3.9 3.2 6.1 2.3 8.5 2.3z" fill="${c}"/><path d="M8.5 5.6c1.5 0 2.8.6 3.9 1.5l1.2-1.2C12.2 4.6 10.4 3.8 8.5 3.8S4.8 4.6 3.4 5.9l1.2 1.2c1.1-.9 2.4-1.5 3.9-1.5z" fill="${c}"/><path d="M8.5 8.9c.7 0 1.2.2 1.7.6L8.5 11.5 6.8 9.5c.5-.4 1-.6 1.7-.6z" fill="${c}"/></svg>`;
  const battSVG = (c, w) => `<svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.6" fill="none" stroke="${c}" stroke-opacity="${c === '#000' ? 0.38 : 0.5}"/><rect x="2" y="2" width="${w}" height="9" rx="2.2" fill="${w <= 4 ? "#FF3B30" : c}"/><path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" fill="${c}" fill-opacity="0.4"/></svg>`;

  const PAD_CLOSED = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M9 13V9.5a5 5 0 0 1 10 0V13" fill="none" stroke="#fff" stroke-width="2.4"/><rect x="6" y="12.5" width="16" height="13" rx="3" fill="#fff"/></svg>`;
  const PAD_OPEN = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M19 13V7.5a5 5 0 0 1 10 0V9" fill="none" stroke="#fff" stroke-width="2.4" transform="translate(-4 0)"/><rect x="2" y="12.5" width="16" height="13" rx="3" fill="#fff"/></svg>`;

  function build(root, cfg) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const add = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const el = d.firstChild; root.appendChild(el); return el; };

    // lock screen
    const notifHTML = (cfg.notifs || []).map((n, i) => `<div class="nt"><div class="ic">${ICONS[n.app]()}</div><div class="ti">${n.title}</div>
        <div class="bd"><span class="lockedTxt">Notification</span><span class="openTxt" style="display:none">${n.body}</span></div><div class="tm">${n.time}</div></div>`).join('');
    add(`<div id="lock"><div class="wp"></div>
      <div id="lkPad">${PAD_CLOSED}</div>
      <div id="lkDate">${cfg.date}</div><div id="lkTime"></div>
      <div id="lkNotifs">${notifHTML}</div>
      <div class="lkBtn" style="left:46px"><svg width="22" height="26" viewBox="0 0 22 26"><path d="M5 2h12v4l-3 5v13H8V11L5 6Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 6h12" stroke="#fff" stroke-width="1.8"/><circle cx="11" cy="15.5" r="1.4" fill="#fff"/></svg></div>
      <div class="lkBtn" style="right:46px"><svg width="26" height="22" viewBox="0 0 26 22"><path d="M3.5 5h4l2-3h7l2 3h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="#fff"/><circle cx="13" cy="12" r="4.3" fill="rgba(20,20,30,.9)"/><circle cx="13" cy="12" r="2.8" fill="#fff"/></svg></div>
      <div id="lkHint">Swipe up to open</div>
    </div>`);

    // home screen
    let hs = `<div id="hs"><div class="wp" id="hsWp"></div><div id="hsC">`;
    const w = cfg.weather;
    hs += `<div class="wd" style="left:27px;top:72px;background:linear-gradient(180deg,#1d2c50,#3d4f78)">
        <div style="position:absolute;left:14px;top:12px;font-size:15px;font-weight:600;letter-spacing:-0.2px">${w.city} <svg width="9" height="9" viewBox="0 0 10 10" style="vertical-align:1px"><path d="M9.5.5 .5 4.3l4.1.9.9 4.3Z" fill="#fff"/></svg></div>
        <div style="position:absolute;left:12px;top:30px;font-size:44px;font-weight:300;letter-spacing:-1px">${w.temp}°</div>
        <svg style="position:absolute;left:14px;top:92px" width="22" height="18" viewBox="0 0 22 18"><path d="M13 2a5 5 0 0 0 6 6.5A6 6 0 1 1 13 2Z" fill="#E8E8EE"/><path d="M6 17h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.5 1.4A2.8 2.8 0 0 0 6 17Z" fill="#fff"/></svg>
        <div style="position:absolute;left:14px;top:113px;font-size:13px;font-weight:600">${w.cond}</div>
        <div style="position:absolute;left:14px;top:131px;font-size:13px;font-weight:500;color:rgba(255,255,255,.9)">H:${w.hi}° L:${w.lo}°</div></div>
      <div class="wdl" style="left:27px;top:229px">Weather</div>
      <div class="wd" style="left:209px;top:72px;background:#fff;color:#000">
        <div style="position:absolute;left:15px;top:14px;font-size:12px;font-weight:700;color:#FF3B30;letter-spacing:.3px">${cfg.dayName.toUpperCase()}</div>
        <div style="position:absolute;left:13px;top:26px;font-size:44px;font-weight:400;letter-spacing:-1px">${cfg.dayNum}</div>
        <div style="position:absolute;left:15px;top:104px;right:12px;font-size:13px;font-weight:500;color:#8E8E93;line-height:17px">No more events today</div></div>
      <div class="wdl" style="left:209px;top:229px">Calendar</div>`;
    GRID.forEach(([k, label], i) => {
      const x = COLX[i % 4], y = ROWY[Math.floor(i / 4)];
      RECT[k] = { x, y, w: 62, h: 62 };
      const b = cfg.badges && cfg.badges[k] ? `<div class="badge">${cfg.badges[k]}</div>` : '';
      hs += `<div class="app" id="ap_${k}" style="left:${x}px;top:${y}px"><div class="ico">${ICONS[k]()}</div>${b}<div class="lb">${label}</div></div>`;
    });
    hs += `<div id="hsSearch"><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="5" cy="5" r="3.8" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M8 8l3 3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>Search</div><div id="hsDock"></div>`;
    DOCK.forEach((k, i) => {
      const x = COLX[i], y = 761;
      RECT[k] = { x, y, w: 62, h: 62 };
      const b = cfg.badges && cfg.badges[k] ? `<div class="badge">${cfg.badges[k]}</div>` : '';
      hs += `<div class="app" id="ap_${k}" style="left:${x}px;top:${y}px"><div class="ico">${ICONS[k]()}</div>${b}</div>`;
    });
    hs += `</div></div>`;
    add(hs);

    add(`<div id="sbar"><div id="sbClock"></div><div id="sbCarrier"></div><div id="sbRight"><span id="sbBars"></span><span id="sbNet"></span><span id="sbBatt"></span></div></div>`);
    add(`<div id="homeind"></div>`);
    add(`<div id="blackout"></div>`);

    // launch icon overlay lives inside #launchclip
    const lc = document.getElementById('launchclip');
    const li = document.createElement('div'); li.id = 'launchIcon'; li.innerHTML = ICONS.whatsapp(); lc.appendChild(li);
    document.getElementById('lkTime').textContent = cfg.lockTime || '';
  }

  // ---------------- per-frame state ----------------
  const $ = (id) => document.getElementById(id);
  let sbCache = '';
  function status(s) {
    const el = $('sbar');
    if (!s || !s.show) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const key = JSON.stringify(s);
    if (key === sbCache) return; sbCache = key;
    const c = s.color;
    el.style.color = c;
    $('sbClock').textContent = s.carrier ? '' : s.time;
    $('sbCarrier').textContent = s.carrier || '';
    $('sbBars').innerHTML = barsSVG(s.bars, c);
    $('sbNet').innerHTML = s.net === 'wifi' ? wifiSVG(c) : (s.net === '3G' ? '3G' : '');
    $('sbNet').style.display = s.net ? 'block' : 'none';
    $('sbBatt').innerHTML = battSVG(c, s.battery);
    $('sbBars').style.display = 'block';
  }

  function lock(s) {
    const el = $('lock');
    if (!s || !s.show) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.transform = `translate(${s.x || 0}px, ${s.y || 0}px)`;
    $('lkTime').textContent = s.time;
    const open = s.pad > 0.5;
    const padKey = open ? 'o' : 'c';
    if ($('lkPad').dataset.k !== padKey) { $('lkPad').innerHTML = open ? PAD_OPEN : PAD_CLOSED; $('lkPad').dataset.k = padKey; }
    const bounce = open ? 1 + 0.12 * Math.sin(Math.min(1, (s.pad - 0.5) * 2) * Math.PI) : 1;
    $('lkPad').style.transform = `scale(${bounce})`;
    document.querySelectorAll('#lkNotifs .lockedTxt').forEach((e) => (e.style.display = s.reveal > 0.5 ? 'none' : 'inline'));
    document.querySelectorAll('#lkNotifs .openTxt').forEach((e) => (e.style.display = s.reveal > 0.5 ? 'inline' : 'none'));
    $('lkHint').style.opacity = s.hint || 0;
    const f = 1 - (s.fade || 0);
    document.querySelectorAll('#lock .lkBtn').forEach((e) => (e.style.opacity = f));
    $('lkNotifs').style.opacity = f * (s.reveal > 0 && s.reveal < 1 ? 0.75 + 0.25 * Math.abs(s.reveal - 0.5) * 2 : 1);
    $('lkPad').style.opacity = f;
  }

  function home(s) {
    const el = $('hs');
    if (!s || !s.show) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const c = $('hsC');
    c.style.transform = `scale(${s.scale ?? 1})`;
    c.style.opacity = s.opacity ?? 1;
    el.style.filter = s.dim ? `brightness(${1 - s.dim})` : 'none';
    for (const k of Object.keys(RECT)) {
      const a = $('ap_' + k); if (!a) continue;
      a.querySelector('.ico').style.filter = s.pressed === k ? 'brightness(0.62)' : 'none';
      a.style.visibility = s.hidden === k ? 'hidden' : 'visible';
    }
  }

  // p: 0..1 eased progress of the launch zoom; null => app fully shown (no transform)
  function launch(p, app = 'whatsapp') {
    const clip = $('launchclip'), a = $('app'), ic = $('launchIcon');
    if (p === null || p >= 1) {
      clip.style.cssText = ''; clip.style.display = 'block';
      a.style.transform = 'none'; ic.style.display = 'none'; return;
    }
    if (p <= 0) { clip.style.display = 'none'; return; }
    const r = RECT[app];
    const x = r.x * (1 - p), y = r.y * (1 - p);
    const w = r.w + (W - r.w) * p, h = r.h + (H - r.h) * p;
    clip.style.display = 'block';
    clip.style.left = x + 'px'; clip.style.top = y + 'px'; clip.style.width = w + 'px'; clip.style.height = h + 'px';
    clip.style.borderRadius = (14 + (44 - 14) * p) + 'px';
    const s = w / W;
    a.style.transform = `translate(0px, ${(h - H * s) / 2}px) scale(${s})`;
    ic.style.display = 'block';
    ic.style.opacity = Math.max(0, 1 - p / 0.35);
  }

  function homeInd(s) {
    const el = $('homeind');
    if (!s || !s.show) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.background = s.color; el.style.opacity = s.opacity ?? 1;
  }
  function blackout(o) { $('blackout').style.opacity = o; $('blackout').style.display = o > 0.001 ? 'block' : 'none'; }

  window.PHONE = { build, status, lock, home, launch, homeInd, blackout, RECT, ICONS, W, H };
})();
