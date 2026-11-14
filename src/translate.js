// Chinese-subtitle version of the chat bubbles (enabled with `scene.html?zh` / `scene2.html?zh`).
// Each bubble first shows the original English, then decodes left to right into Chinese, with a
// short band of scrambled glyphs at the front, in the style of Cyberpunk 2077's translated NPC lines.
// Bubbles decode at their English size, then ease to the (usually smaller) Chinese size; the scenes
// re-measure the chat every frame so the scroll framing holds while bubbles shrink.
// Only message text is translated; the iOS/WhatsApp UI (day pills, "last seen", times, keyboard,
// the text being typed in the input field) stays English.
// Without `?zh` every function here is a no-op, so the English videos render exactly as before.
(function () {
  const on = /(^|[?&])zh(=|&|$)/.test(location.search.slice(1));

  const CN = {
    'ok I’m gonna try to finish it tonight': '好 我今晚争取把它弄完',
    'good luck lmao': '祝你好运哈哈哈',
    'Did you ever finish that poster last night?': '你昨晚那张海报到底做完没？',
    'Barely 😭': '勉强做完 😭',
    'I went to bed at like 3.': '我差不多三点才睡。',
    'Knew it lol': '我就知道哈哈',
    'Send it to me when you get to campus': '到学校了发我看看',
    'Yeah yeah': '好好好',
    'btw I’m not coming to club this afternoon': '对了 我今天下午不去社团了',
    'Why?': '为啥？',
    'I left the box with the display stuff at my dad’s old place': '我把装展示用品的箱子落在我爸的老房子那边了',
    'the printed boards + a bunch of the materials are still there': '打印好的展板还有一堆材料都还在那儿',
    'Need to go pick them up before I forget again': '得赶紧去拿回来，不然我又要忘了',
    'That old house?': '那栋老房子？',
    'Yeah': '对',
    'Haven’t been back there in ages lol': '好久没回去过了哈哈',
    'Alright': '好吧',
    'See you tomorrow then': '那明天见',
    'You alive?': '你还活着吗？',
    'Hey, you haven’t been in class either': '喂，你也没来上课',
    'Everything okay?': '你没事吧？',
    'I’m coming over to check on you.': '那我过来找你了',
    'I’m here.': '我到了。',
  };

  const LATIN = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz0123456789#$%&*+=<>?/';
  const HAN = [...new Set(Object.values(CN).join('').replace(/[\s，。？！😭a-zA-Z0-9]/gu, ''))].join('');
  const POOL = [...(LATIN + HAN)];
  const TRAIL = /(\s*(?:😭|👍))$/u;

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const smooth = (x) => x * x * (3 - 2 * x);
  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  let items = [], emojify = (s) => s;

  // HTML for one item at decode progress p (0 = all English, 1 = all Chinese).
  // `widest` swaps the random glyphs for full-width ones, for worst-case layout checks.
  function mixed(it, p, frame, widest) {
    if (p <= 0) return emojify(esc(it.en + it.tail));
    if (p >= 1) return emojify(esc(it.cn + it.tail));
    const E = it.E, C = it.C;
    const kc = Math.floor(p * C.length);
    const sN = Math.min(3, C.length - kc);
    const ke = Math.min(E.length, Math.round(p * E.length + sN * E.length / C.length));
    let scr = '';
    for (let i = 0; i < sN; i++) scr += widest ? '国' : POOL[hash(it.idx, kc + i, frame) % POOL.length];
    return emojify(esc(C.slice(0, kc).join('')) + `<span class="zhscr">${esc(scr)}</span>` + esc(E.slice(ke).join('') + it.tail));
  }

  function prepare(root, emojifyFn) {
    if (!on) return;
    emojify = emojifyFn;
    const st = document.createElement('style');
    st.textContent = `@font-face { font-family: "ZHSub"; src: url("fonts/NotoSansSC-subset.otf") format("opentype"); }
      #screen { font-family: "Noto Sans", "ZHSub", sans-serif !important; }
      .zhscr { opacity: 0.55; }`;
    document.head.appendChild(st);
    return document.fonts.load('16px ZHSub', '我').then(() => {
      items = [];
      root.querySelectorAll('.tx').forEach((tx, idx) => {
        const full = tx.dataset.en;
        const cnFull = CN[full];
        if (!cnFull) { console.warn('ZH: no translation for', full); return; }
        const tail = (full.match(TRAIL) || ['', ''])[1];
        const en = tail ? full.slice(0, -tail.length) : full;
        const cn = tail ? cnFull.replace(TRAIL, '') : cnFull;
        const b = tx.closest('.b'), row = tx.closest('.row');
        const it = { idx, tx, b, row, wrap: tx.closest('[id$="Wrap"]'), en, cn, tail, E: [...en], C: [...cn], start: Infinity, dur: 0, key: '' };
        // natural sizes
        tx.innerHTML = mixed(it, 0); it.wEN = b.offsetWidth; it.hEN = b.offsetHeight;
        tx.innerHTML = mixed(it, 1); it.wCN = b.offsetWidth; it.hCN = b.offsetHeight;
        if (it.hCN !== it.hEN) console.warn(`ZH: line count changes for "${full}" (${it.hEN} -> ${it.hCN}px)`);
        it.oneLine = it.hEN <= 36 && it.hCN <= 36;
        it.wMax = Math.max(it.wEN, it.wCN);
        // worst case while decoding: the bubble keeps its English height (and is at least as wide as
        // either version), so the mixed text must still fit inside it
        b.style.height = 'auto'; b.style.width = it.wMax + 'px'; b.style.whiteSpace = it.oneLine ? 'nowrap' : '';
        let bad = 0;
        for (let k = 1; k < 20; k++) {
          tx.innerHTML = mixed(it, k / 20, 0, true);
          if (b.offsetHeight > it.hEN + 1) bad++;
        }
        if (bad) console.warn(`ZH: "${full}" overflows its bubble at ${bad}/19 steps`);
        b.style.width = ''; b.style.whiteSpace = '';
        b.style.height = it.hEN + 'px';
        tx.innerHTML = mixed(it, 0);
        items.push(it);
      });
    });
  }
  const SETTLE = 0.3;   // after decoding, the bubble eases to the Chinese text's size

  // sample(t) must lay the chat out for time t and return { y: content offset, top, bottom } of the
  // visible chat area, or null when the chat isn't on screen. Each bubble starts decoding `hold`
  // seconds after it is first fully visible, staggered top-to-bottom.
  function schedule(sample, t0, t1, { hold = 0.6, stagger = 0.12, step = 1 / 30, hidden = [] } = {}) {
    if (!on) return;
    const seen = new Map();
    for (let t = t0; t <= t1 + 1e-6; t += step) {
      const v = sample(t);
      if (!v) continue;
      for (const it of items) {
        if (seen.has(it)) continue;
        if (it.wrap && it.wrap.offsetHeight < it.wrap.firstElementChild.offsetHeight - 0.5) continue;
        const top = v.y + it.row.offsetTop, bot = top + it.row.offsetHeight;
        if (top >= v.top - 2 && bot <= v.bottom + 2) seen.set(it, { t, top });
      }
    }
    const order = [...seen.entries()].sort((a, b) => a[1].t - b[1].t || a[1].top - b[1].top);
    let prev = -Infinity;
    for (const [it, s] of order) {
      it.start = Math.max(s.t + hold, prev + stagger);
      it.dur = Math.min(1.3, Math.max(0.45, 0.3 + 0.016 * it.E.length));
      // don't decode while something covers the chat; wait until it is back on screen
      for (const [a, b] of hidden) if (it.start + it.dur > a && it.start < b) it.start = b + hold;
      prev = it.start;
    }
    return order.map(([it]) => ({ en: it.en, start: +it.start.toFixed(2), dur: +it.dur.toFixed(2) }));
  }

  function apply(t) {
    if (!on) return;
    const frame = Math.floor(t * 20);              // scrambled glyphs change 20x per second
    for (const it of items) {
      const p = it.start === Infinity ? 0 : Math.max(0, Math.min(1, (t - it.start) / it.dur));
      const mid = p > 0 && p < 1;
      const q = p < 1 ? 0 : smooth(Math.min(1, (t - it.start - it.dur) / SETTLE));
      const key = mid ? p.toFixed(3) + ':' + frame : p + ':' + q.toFixed(4);
      if (key === it.key) continue;
      it.key = key;
      it.tx.innerHTML = mixed(it, p, frame);
      let w, h = it.hEN;
      if (p <= 0) w = it.wEN;
      else if (mid) w = it.wEN + (it.wMax - it.wEN) * smooth(Math.min(1, (t - it.start) / 0.15));
      else { w = it.wMax + (it.wCN - it.wMax) * q; h = it.hEN + (it.hCN - it.hEN) * q; }
      it.b.style.width = p <= 0 ? '' : w.toFixed(2) + 'px';
      it.b.style.height = h.toFixed(2) + 'px';
      it.b.style.whiteSpace = mid && it.oneLine ? 'nowrap' : '';
    }
  }

  const wrap = (text, html) => on ? `<span class="tx" data-en="${esc(text)}">${html}</span>` : html;

  window.ZH = { on, prepare, schedule, apply, wrap, CN };
})();
