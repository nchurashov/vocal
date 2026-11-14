// ===== MP4 от MediaRecorder: найти «замёрзший» хвост видео и обрезать файл по последнему живому кадру =====
// Бывает на iPhone: холст перестаёт отдавать кадры, звук пишется дальше, а последний кадр растягивается до конца
// (видео «зависло, звук идёт»). Файл фрагментированный (moov + moof/mdat), обрезаем без перекодирования:
// переписываем только таблицы сэмплов (trun), данные в mdat не трогаем.
const CONT = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'edts']);
function kids(u8, s, e) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = [];
  while (s + 8 <= e) {
    let size = dv.getUint32(s), hdr = 8;
    const type = String.fromCharCode(u8[s + 4], u8[s + 5], u8[s + 6], u8[s + 7]);
    if (size === 1) { size = Number(dv.getBigUint64(s + 8)); hdr = 16; } else if (size === 0) size = e - s;
    if (size < hdr || s + size > e) throw new Error('mp4: битая коробка ' + type);
    out.push({ type, s, size, hdr, e: s + size, p: s + hdr });
    s += size;
  }
  return out;
}
const find = (u8, b, t) => b && CONT.has(b.type) ? kids(u8, b.p, b.e).find(k => k.type === t) : null;
const all = (u8, b, t) => kids(u8, b.p, b.e).filter(k => k.type === t);

function parseTfhd(dv, b) {
  let o = b.p; const f = dv.getUint32(o) & 0xffffff; o += 4;
  const r = { f, id: dv.getUint32(o) }; o += 4;
  if (f & 1) { r.base = Number(dv.getBigUint64(o)); o += 8; }
  if (f & 2) { r.sdi = dv.getUint32(o); o += 4; }
  if (f & 8) { r.dur = dv.getUint32(o); o += 4; }
  if (f & 0x10) { r.size = dv.getUint32(o); o += 4; }
  if (f & 0x20) { r.flags = dv.getUint32(o); o += 4; }
  return r;
}
function parseTrun(dv, b, dDur, dSize, dFlags) {
  let o = b.p; const f = dv.getUint32(o) & 0xffffff, n = dv.getUint32(o + 4); o += 8;
  const r = { f, smp: [] };
  if (f & 1) { r.off = dv.getInt32(o); o += 4; }
  if (f & 4) { r.first = dv.getUint32(o); o += 4; }
  for (let i = 0; i < n; i++) {
    const x = { d: dDur, z: dSize, fl: dFlags, c: 0 };
    if (f & 0x100) { x.d = dv.getUint32(o); o += 4; }
    if (f & 0x200) { x.z = dv.getUint32(o); o += 4; }
    if (f & 0x400) { x.fl = dv.getUint32(o); o += 4; }
    if (f & 0x800) { x.c = dv.getInt32(o); o += 4; }
    r.smp.push(x);
  }
  return r;
}
// разбор: дорожки (вид, шкала времени) и все сэмплы с временем, плюс положение данных в файле
export function mp4Parse(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), top = kids(u8, 0, u8.length);
  const moov = top.find(b => b.type === 'moov'); if (!moov) return null;
  const tr = {};
  for (const t of all(u8, moov, 'trak')) {
    const tk = find(u8, t, 'tkhd'), md = find(u8, t, 'mdia'), mh = find(u8, md, 'mdhd'), hd = find(u8, md, 'hdlr');
    if (!tk || !mh || !hd) continue;
    const id = dv.getUint32(tk.p + (u8[tk.p] === 1 ? 20 : 12)), ts = dv.getUint32(mh.p + (u8[mh.p] === 1 ? 20 : 12));
    tr[id] = { id, ts, kind: String.fromCharCode(...u8.subarray(hd.p + 8, hd.p + 12)), dDur: 0, dSize: 0, dFlags: 0, next: 0, smp: [] };
  }
  const mvex = find(u8, moov, 'mvex');
  if (mvex) for (const x of all(u8, mvex, 'trex')) { const t = tr[dv.getUint32(x.p + 4)]; if (t) { t.dDur = dv.getUint32(x.p + 12); t.dSize = dv.getUint32(x.p + 16); t.dFlags = dv.getUint32(x.p + 20); } }
  const moofs = [];
  for (const m of top.filter(b => b.type === 'moof')) {
    const M = { box: m, trafs: [] }; let prevEnd = m.s;
    all(u8, m, 'traf').forEach((tf, ti) => {
      const hb = find(u8, tf, 'tfhd'); if (!hb) throw new Error('mp4: нет tfhd');
      if (find(u8, tf, 'saio')) throw new Error('mp4: saio не поддерживается');
      const h = parseTfhd(dv, hb), t = tr[h.id]; if (!t) throw new Error('mp4: чужая дорожка');
      const dt = find(u8, tf, 'tfdt');
      if (dt) t.next = u8[dt.p] === 1 ? Number(dv.getBigUint64(dt.p + 4)) : dv.getUint32(dt.p + 4);
      const base = h.f & 1 ? h.base : (h.f & 0x20000) || ti === 0 ? m.s : prevEnd;
      const T = { box: tf, h, t, truns: [] }; let pos = base;
      all(u8, tf, 'trun').forEach((rb, ri) => {
        const r = parseTrun(dv, rb, h.f & 8 ? h.dur : t.dDur, h.f & 0x10 ? h.size : t.dSize, h.f & 0x20 ? h.flags : t.dFlags);
        pos = r.off != null ? base + r.off : ri === 0 ? base : pos;
        r.pos = pos;
        for (const x of r.smp) { x.t = t.next; t.next += x.d; x.at = pos; pos += x.z; t.smp.push(x); }
        T.truns.push(r);
      });
      prevEnd = pos; M.trafs.push(T);
    });
    moofs.push(M);
  }
  if (!moofs.length) return null;
  return { top, moov, tr: Object.values(tr), moofs };
}
// замёрзший хвост: кадр дольше 2 с (iPhone растягивает последний кадр до конца звука) или картинка кончилась раньше звука
// -> { cut: секунда обрыва, total: длина файла } или null, если всё в порядке
export function mp4Frozen(u8) {
  let P; try { P = mp4Parse(u8); } catch (e) { return null; }
  if (!P) return null;
  const v = P.tr.find(t => t.kind === 'vide'), a = P.tr.find(t => t.kind === 'soun');
  if (!v || !v.smp.length) return null;
  const ds = v.smp.map(x => x.d).sort((x, y) => x - y), md = ds[ds.length >> 1] || 1;
  const vEnd = v.next / v.ts, aEnd = a && a.smp.length ? a.next / a.ts : 0, total = Math.max(vEnd, aEnd);
  const long = v.smp.find(x => x.d / v.ts > 2 && x.d > md * 20);
  const cut = long ? (long.t + md) / v.ts : vEnd < aEnd - 2 ? vEnd : null;
  return cut == null || total - cut < 1.5 ? null : { cut: Math.round(cut * 100) / 100, total: Math.round(total * 100) / 100 };
}
// обрезать файл на секунде cut: сэмплы позже выкидываются из таблиц, последний кадр укорачивается до cut
// -> новый Uint8Array или null, если файл устроен иначе, чем мы умеем
export function mp4Trim(u8, cut) {
  let P; try { P = mp4Parse(u8); } catch (e) { return null; }
  if (!P) return null;
  // новые moof: в каждом trun только сэмплы до cut; база данных - начало moof, смещения проставим после раскладки
  const built = new Map();
  for (const M of P.moofs) {
    const parts = [];
    for (const k of kids(u8, M.box.p, M.box.e)) {
      if (k.type !== 'traf') { parts.push({ raw: u8.subarray(k.s, k.e) }); continue; }
      const T = M.trafs.find(x => x.box.s === k.s), lim = Math.round(cut * T.t.ts), h = T.h;
      const tp = []; let ri = 0;
      for (const c of kids(u8, k.p, k.e)) {
        if (c.type === 'tfhd') {
          const f = (h.f & ~1) | 0x20000, b = [];
          b.push(u32(f), u32(h.id)); if (f & 2) b.push(u32(h.sdi)); if (f & 8) b.push(u32(h.dur)); if (f & 0x10) b.push(u32(h.size)); if (f & 0x20) b.push(u32(h.flags));
          tp.push(box('tfhd', b));
        } else if (c.type === 'trun') {
          const r = T.truns[ri++];
          const keep = r.smp.filter(x => x.t < lim); if (!keep.length) continue;
          let f = r.f | 1; const last = keep[keep.length - 1], cl = T.t.kind === 'vide' && last.t + last.d > lim;
          const d = keep.map(x => x === last && cl ? Math.max(1, lim - x.t) : x.d);
          if (cl && !(f & 0x100)) f |= 0x100;
          const b = [u32(f), u32(keep.length), null];
          if (f & 4) b.push(u32(r.first));
          keep.forEach((x, i) => { if (f & 0x100) b.push(u32(d[i])); if (f & 0x200) b.push(u32(x.z)); if (f & 0x400) b.push(u32(x.fl)); if (f & 0x800) b.push(u32(x.c)); });
          const bx = box('trun', b.map(x => x || new Uint8Array(4)));
          tp.push({ trunBox: bx, at: keep[0].at });
        } else tp.push({ raw: u8.subarray(c.s, c.e) });
      }
      parts.push({ traf: tp });
    }
    built.set(M.box.s, parts);
  }
  // раскладка: moof пересобраны, sidx/mfra (там старые смещения) выкидываем, остальное копируем как есть
  const out = [], map = []; let pos = 0;
  for (const b of P.top) {
    if (b.type === 'sidx' || b.type === 'mfra') continue;
    if (b.type === 'moof') {
      const parts = built.get(b.s), flat = [], fix = [];
      let size = 8;
      for (const p of parts) {
        if (p.raw) { flat.push(p.raw); size += p.raw.length; continue; }
        const inner = []; let ts = 8;
        for (const q of p.traf) { const bytes = q.raw || q.trunBox || q; inner.push(bytes); if (q.trunBox) fix.push({ bytes: q.trunBox, at: q.at }); ts += bytes.length; }
        const hd = new Uint8Array(8); new DataView(hd.buffer).setUint32(0, ts); hd.set([0x74, 0x72, 0x61, 0x66], 4);
        flat.push(hd, ...inner); size += ts;
      }
      const hd = new Uint8Array(8); new DataView(hd.buffer).setUint32(0, size); hd.set([0x6d, 0x6f, 0x6f, 0x66], 4);
      out.push({ start: pos, chunks: [hd, ...flat], fix }); pos += size; continue;
    }
    let bytes = u8.subarray(b.s, b.e);
    if (b.type === 'moov') bytes = moovCut(u8, b, cut);
    map.push({ from: b.s, to: b.e, at: pos }); out.push({ start: pos, chunks: [bytes] }); pos += bytes.length;
  }
  for (const o of out) for (const f of o.fix || []) {
    const m = map.find(x => f.at >= x.from && f.at < x.to); if (!m) return null;
    new DataView(f.bytes.buffer, f.bytes.byteOffset).setInt32(16, m.at + (f.at - m.from) - o.start);
  }
  const res = new Uint8Array(pos); let w = 0;
  for (const o of out) for (const c of o.chunks) { res.set(c, w); w += c.length; }
  return res;
}
function u32(x) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0); return b; }
function box(type, parts) {
  const n = 8 + parts.reduce((s, p) => s + p.length, 0), b = new Uint8Array(n), d = new DataView(b.buffer);
  d.setUint32(0, n); for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  let o = 8; for (const p of parts) { b.set(p, o); o += p.length; }
  return b;
}
// длительности в moov (mvhd, mehd, tkhd, mdhd), если они записаны, не больше cut
function moovCut(u8, moov, cut) {
  const c = u8.slice(moov.s, moov.e), dv = new DataView(c.buffer), sh = -moov.s;
  const k = b => ({ ...b, s: b.s + sh, e: b.e + sh, p: b.p + sh });
  const mv = find(c, k(moov), 'mvhd'); if (!mv) return c;
  const v1 = c[mv.p] === 1, mts = dv.getUint32(mv.p + (v1 ? 20 : 12));
  const put = (o, big, ts) => { const lim = Math.round(cut * ts); if (big) { if (Number(dv.getBigUint64(o)) > lim) dv.setBigUint64(o, BigInt(lim)); } else if (dv.getUint32(o) > lim && dv.getUint32(o) !== 0xffffffff) dv.setUint32(o, lim); };
  put(mv.p + (v1 ? 24 : 16), v1, mts);
  const mvex = find(c, k(moov), 'mvex'), mehd = mvex && find(c, mvex, 'mehd');
  if (mehd) put(mehd.p + 4, c[mehd.p] === 1, mts);
  for (const t of all(c, k(moov), 'trak')) {
    const tk = find(c, t, 'tkhd'), md = find(c, t, 'mdia'), mh = md && find(c, md, 'mdhd');
    if (tk) put(tk.p + (c[tk.p] === 1 ? 28 : 20), c[tk.p] === 1, mts);
    if (mh) { const w = c[mh.p] === 1; put(mh.p + (w ? 24 : 16), w, dv.getUint32(mh.p + (w ? 20 : 12))); }
  }
  return c;
}
