/**
 * EUROBOND HESAP MOTORU (saf JavaScript modülü)
 * ---------------------------------------------------------------------------
 * Ekran, DOM ve internet bağlantısı içermez. Tarayıcıda ve Node.js'te çalışır.
 * Tüm tarihler UTC gece yarısı olarak işlenir. Fiyatlar 100 nominal başınadır.
 *
 * KULLANIM
 *   import { analyze, setDataDate, availableModes, nominalForAmount } from "./eurobond-hesap.js";
 *   setDataDate("2026-11-04");                         // Excel nakit akışının çekildiği tarih
 *   const r = analyze(bond, { price: 99, settlement: "2026-11-06", nominal: 1000000, mode: "c" });
 *   // r.yield, r.accrued, r.dirtyPrice, r.amount, r.flows ...
 *   const g = analyze(bond, { yield: 0.12, settlement: "2026-11-06" });   // getiriden fiyata
 *
 * KIYMET NESNESİ (bond) ALANLARI
 *   i=ISIN, s=ihraççı, m=vade tarihi (perpetual'da boş), d=ihraç tarihi, k=para birimi,
 *   dc=gün sayımı ("30E" | "AA" | "A360" | "A365"), c=kupon oranı (%), p=kupon sıklığı (ay),
 *   cd=call tarihi, cp=call fiyatı, ca=kupon tutarları [[tutar, adet], ...] (1.000.000 nominal için),
 *   q=[ilk kupon tarihi, adet] (düzenli takvim) veya x=[kupon tarihleri] (düzensiz takvim),
 *   mp/mi=minimum işlem tutarı ve katı.
 *
 * HESAPLAMA FORMÜLLERİ
 *   f = yılda kupon sayısı (12 / p), c = yıllık kupon oranı
 *   1) Gün sayımı
 *      30E/360 : gün = 360*(Y2-Y1) + 30*(A2-A1) + min(G2,30) - min(G1,30)      (d360)
 *      ACT     : takvim günü farkı                                              (act)
 *      ACT/ACT : payda = ilgili kupon döneminin gerçek gün sayısı
 *      ACT/360, ACT/365 : payda 360 veya 365
 *   2) Kupon
 *      Düzenli dönem : 100 * c / f
 *      Kısa/uzun dönem : 100 * c / f * (gerçek dönem günü / normal dönem günü)
 *      ca alanı varsa : kupon = tutar / 10.000  (1.000.000 nominal için tutar, 100 nominale çevrilir)
 *   3) Birikmiş faiz (ai) : s = önceki kupon, e = sonraki kupon, t = takas
 *      ai = dönem kuponu * gün(s,t) / dönem uzunluğu(s,e)
 *      30E : oran = d360(s,t) / (360/f)  (dönem düzensizse payda d360(s,e))
 *      ACT/ACT : oran = act(s,t) / act(s,e)
 *      ACT/360, ACT/365 : ai = 100 * c * act(s,t) / 360 (veya 365)
 *   4) Kirli fiyat = temiz fiyat + ai;  tutar = kirli fiyat / 100 * nominal
 *   5) Getiri (YTM; yıllık, kupon sıklığına göre bileşik)
 *      X[0] = (e - t) / dönem uzunluğu ;  X[j] = X[j-1] + 1 (düzensiz dönemde gün oranı)
 *      kirli fiyat = toplam_j [ (kupon_j + anapara_j) / (1 + y/f) ^ X_j ]
 *      y, [-%90, %500] aralığında ikiye bölme (bisection) ile 200 adımda bulunur. f=0 ise f=1.
 *   6) Getiriden fiyata : yukarıdaki toplam, temiz fiyat = kirli fiyat - ai
 *   7) Call'a göre (mode "c") : akış call tarihinde kesilir, anapara = call fiyatı (yoksa 100).
 *      Call tarihi kupon günü değilse son kupondan call'a gün oranıyla kısmi kupon eklenir.
 *   8) Perpetual : "m" kuponlar 2099'a kadar, anapara 100 ve son kupon tarihinde;
 *      "r" kupon tutarının ilk değiştiği tarihten önceki son kupon tarihine kadar, fiyat 100.
 *   9) Müşteri tutarı : nominal = taban(tutar / (kirli fiyat/100) / 1000) * 1000
 *
 * DOĞRULAMA DURUMU
 *   Birikmiş faiz XS1772390628'de Bloomberg YAS ile birebir tuttu (24.113,11).
 *   Aynı kıymette getiri YAS'a göre 4,6 baz puan farklı çıktı (YAS %12,2026; bu motor %12,2485);
 *   nedeni bulunamadı. Diğer kıymetler Bloomberg ile karşılaştırılmadı. Resmî kullanımdan önce
 *   kurumun yöntemiyle karşılaştırın.
 */
const D = (s) => new Date(s + "T00:00:00Z"),
  DAY = 864e5,
  gd = (d) => d.getUTCDate(),
  T = (d) => d.getTime();
function addM(d, n, a) {
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + n,
    y = Math.floor(t / 12),
    m = t - y * 12,
    l = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(a, l)));
}
const act = (a, b) => Math.round((b - a) / DAY);
function d360(a, b) {
  return (
    360 * (b.getUTCFullYear() - a.getUTCFullYear()) +
    30 * (b.getUTCMonth() - a.getUTCMonth()) +
    Math.min(gd(b), 30) -
    Math.min(gd(a), 30)
  );
}
const fd = (d) =>
  String(gd(d)).padStart(2, "0") +
  "." +
  String(d.getUTCMonth() + 1).padStart(2, "0") +
  "." +
  d.getUTCFullYear();
function sched(b) {
  let o = [];
  if (b.x) o = b.x.map(D);
  else if (b.q) {
    const f = D(b.q[0]),
      a = gd(f);
    for (let k = 0; k < b.q[1]; k++) o.push(addM(f, k * b.p, a));
  }
  return o;
}
let DD = T(D("2026-11-04"));
const stdN = (b) => (/hazine|government bond/i.test(b.s) && b.k === "USD" ? 1 : 2);
const todayU = () => {
  const t = new Date();
  return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
};
const HOL = (() => {
  const us = new Set(),
    tr = new Set(),
    pad = (n) => String(n).padStart(2, "0"),
    iso = (t) => t.toISOString().slice(0, 10),
    U = (y, m, d) => new Date(Date.UTC(y, m - 1, d)),
    nth = (y, m, w, n) => {
      let c = 0;
      for (let d = 1; d <= 31; d++) {
        const t = U(y, m, d);
        if (t.getUTCMonth() !== m - 1) break;
        if (t.getUTCDay() === w && ++c === n) return d;
      }
    },
    last = (y, m, w) => {
      for (let d = 31; d > 0; d--) {
        const t = U(y, m, d);
        if (t.getUTCMonth() === m - 1 && t.getUTCDay() === w) return d;
      }
    },
    fx = (y, m, d) => {
      us.add(iso(U(y, m, d)));
      if (U(y, m, d).getUTCDay() === 0) us.add(iso(U(y, m, d + 1)));
    };
  for (let y = 2020; y <= 2032; y++) {
    fx(y, 1, 1);
    us.add(iso(U(y, 1, nth(y, 1, 1, 3))));
    us.add(iso(U(y, 2, nth(y, 2, 1, 3))));
    us.add(iso(U(y, 5, last(y, 5, 1))));
    if (y >= 2021) fx(y, 6, 19);
    fx(y, 7, 4);
    us.add(iso(U(y, 9, nth(y, 9, 1, 1))));
    us.add(iso(U(y, 10, nth(y, 10, 1, 2))));
    fx(y, 11, 11);
    us.add(iso(U(y, 11, nth(y, 11, 4, 4))));
    fx(y, 12, 25);
    [
      [1, 1],
      [4, 23],
      [5, 1],
      [5, 19],
      [8, 30],
      [10, 29],
    ].forEach((a) => tr.add(iso(U(y, a[0], a[1]))));
    if (y >= 2017) tr.add(iso(U(y, 7, 15)));
  }
  [
    [2021, 5, 13, 7, 20],
    [2022, 5, 2, 7, 9],
    [2023, 4, 21, 6, 28],
    [2024, 4, 10, 6, 16],
    [2025, 3, 30, 6, 6],
    [2026, 3, 20, 5, 27],
    [2027, 3, 9, 5, 16],
    [2028, 2, 27, 5, 5],
  ].forEach((a) => {
    for (let i = 0; i < 3; i++) tr.add(iso(U(a[0], a[1], a[2] + i)));
    for (let i = 0; i < 4; i++) tr.add(iso(U(a[0], a[3], a[4] + i)));
  });
  return { us, tr };
})();
const isBD = (d, k) => {
  const w = d.getUTCDay();
  if (w === 0 || w === 6) return false;
  const s = d.toISOString().slice(0, 10);
  return !(HOL.tr.has(s) || (k === "USD" && HOL.us.has(s)));
};
function nextBD(from, n, k) {
  let t = from;
  while (n > 0) {
    t = new Date(+t + DAY);
    if (isBD(t, k)) n--;
  }
  return t;
}
const stdSt = (b) => nextBD(todayU(), stdN(b), b.k);
function fcInfo(b, S) {
  const iss = D(b.d),
    p = b.p;
  if (!p || !S.length) return { r: iss, m: 0, lf: false };
  const a = gd(S[0]);
  let r = addM(S[0], -p, a),
    m = 0;
  while (T(r) > DD) {
    r = addM(r, -p, a);
    m++;
  }
  return { r, m, lf: T(iss) < T(r) && act(iss, r) < 0.25 * act(addM(r, -p, a), r) };
}
function p99(b) {
  if (b.m || !b.ca) return b;
  const S = sched(b),
    C = caArr(b);
  if (C.length !== S.length) return b;
  let n = 0;
  while (n < S.length && S[n].getUTCFullYear() <= 2099) n++;
  if (n < 2 || n === S.length) return b;
  const iso = (d) => d.toISOString().slice(0, 10);
  return Object.assign({}, b, {
    x: S.slice(0, n).map(iso),
    q: undefined,
    ca: C.slice(0, n).map((v) => [v, 1]),
    _ca: C.slice(0, n),
  });
}
function calc(b, px, st, yIn, mode) {
  if (mode === "m") b = p99(b);
  let cv = null;
  if (mode === "r") {
    cv = resetView(b, st);
    if (cv) b = cv;
  } else if (mode !== "m") {
    cv = callView(b, st);
    if (cv) b = cv;
  }
  const S = sched(b);
  if (!S.length) return { err: "Bu kıymet için Excel’de nakit akışı yok (vadesi geçmiş olabilir)." };
  const iss = D(b.d),
    end = S[S.length - 1],
    p = b.p,
    a = gd(S[0]),
    c = (b.c || 0) / 100,
    dc = b.dc,
    f = p ? 12 / p : 1,
    A = dc === "A360" || dc === "A365",
    base = dc === "A360" ? 360 : 365;
  const { r, m, lf } = fcInfo(b, S),
    ex = lf || m > 0,
    rs0 = b._a0 ? D(b._a0) : p ? addM(S[0], -p, a) : iss,
    A0 = b._a0 ? D(b._a0) : lf || !p ? iss : new Date(Math.max(T(iss), T(r)));
  if (st < iss) return { err: "Takas tarihi ihraç tarihinden (" + fd(iss) + ") önce olamaz." };
  if (st < A0)
    return { err: "Takas tarihi, faizin işlemeye başladığı tarihten (" + fd(A0) + ") önce olamaz." };
  if (st >= end)
    return { err: "Takas tarihi, nakit akışının son tarihinden (" + fd(end) + ") önce olmalıdır." };
  const G = (n) => addM(S[0], -n * p, a),
    pos = (t) => {
      if (dc === "30E") return -d360(t, S[0]) / (360 / f);
      let n = 0;
      while (T(G(n + 1)) > T(t)) n++;
      return -n - act(t, G(n)) / act(G(n + 1), G(n));
    };
  const mdf = (x, y) => (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(),
    isReg = (x, y) => p > 0 && mdf(x, y) === p && Math.abs(gd(y) - gd(x)) <= 5,
    st0 = (k) => (k === 0 ? A0 : S[k - 1]),
    rl = (k) => {
      const x = k === 0 ? rs0 : S[k - 1];
      return p ? act(x, addM(x, p, a)) : base;
    };
  const CA = b.ca ? caArr(b) : null,
    frT = (s, e, t, kk) => {
      const q =
        dc === "30E"
          ? d360(s, t) / (p > 0 && isReg(s, e) ? 360 / f : d360(s, e))
          : dc === "AA"
            ? act(s, t) / (p > 0 && isReg(s, e) ? rl(kk) : act(s, e))
            : act(s, t) / act(s, e);
      return isFinite(q) ? q : 0;
    },
    cpn = (k) => {
      if (CA && k < CA.length) return CA[k] / 1e4;
      const s = st0(k),
        e = S[k];
      if (A) return (100 * c * act(s, e)) / base;
      if (ex && k === 0 && dc === "AA") return ((-100 * c) / f) * pos(A0);
      if (T(s) === T(k === 0 ? rs0 : S[k - 1]) && isReg(s, e)) return (100 * c) / f;
      return dc === "AA"
        ? p
          ? (((100 * c) / f) * act(s, e)) / rl(k)
          : (100 * c * act(s, e)) / 365
        : (100 * c * d360(s, e)) / 360;
    };
  const k = S.findIndex((d) => d > st),
    s = st0(k),
    e = S[k],
    exk = ex && k === 0;
  let ai =
    CA && k < CA.length
      ? (CA[k] / 1e4) * frT(s, e, st, k)
      : A
        ? (100 * c * act(s, st)) / base
        : exk && dc === "AA"
          ? ((100 * c) / f) * (pos(st) - pos(A0))
          : dc === "AA"
            ? p
              ? (((100 * c) / f) * act(s, st)) / rl(k)
              : (100 * c * act(s, st)) / 365
            : (100 * c * d360(s, st)) / 360;
  const noai = false;
  const w = p
    ? dc === "30E"
      ? d360(st, e) / (360 / f)
      : exk
        ? -pos(st)
        : act(st, e) / rl(k)
    : dc === "30E"
      ? d360(st, e) / 360
      : act(st, e) / base;
  const mat = b.m ? D(b.m) : null,
    last = !!mat && Math.abs(act(end, mat)) <= 5,
    cdm = b.cd && T(D(b.cd)) === T(end),
    pp = last ? 100 : cdm ? b.cp || 100 : 100,
    odd = !last && b.cd && !cdm;
  const flows = S.slice(k).map((d, j) => ({ d, cpn: cpn(k + j), pr: k + j === S.length - 1 ? pp : 0 }));
  const ux = (j) => {
    const kk = k + j,
      s = st0(kk),
      e = S[kk];
    if (!p) return 0;
    if (T(s) === T(S[kk - 1]) && isReg(s, e)) return 1;
    return dc === "30E" ? d360(s, e) / (360 / f) : act(s, e) / act(s, addM(s, p, a));
  };
  const X = [w];
  for (let j = 1; j < flows.length; j++) X.push(X[j - 1] + ux(j));
  let dirty = px + ai;
  const pv = (y) => flows.reduce((t, x, j) => t + (x.cpn + x.pr) / Math.pow(1 + y / f, X[j]), 0);
  if (yIn != null) {
    dirty = pv(yIn);
    px = dirty - ai;
  }
  let lo = -0.9,
    hi = 5;
  for (let n = 0; n < 200; n++) {
    const mm = (lo + hi) / 2;
    if (pv(mm) > dirty) lo = mm;
    else hi = mm;
  }
  return {
    ai,
    dirty,
    px,
    y: yIn != null ? yIn : (lo + hi) / 2,
    flows,
    end,
    pp,
    last,
    noai,
    lf,
    odd,
    skip: m > 0 && T(iss) <= DD,
    first: S[0],
    cm: !!cv && !cv._rv,
    rm: !!(cv && cv._rv),
    mm: mode === "m",
  };
}
function hcalc(b, px, st) {
  let r = calc(b, px, st);
  if (!r.err || !b.p || (!b.q && !b.x)) return r;
  const p = b.p,
    S = sched(b);
  if (!S.length) return r;
  const a = gd(S[0]);
  let f = S[0],
    j = 0;
  while (T(addM(f, -p, a)) > T(st)) {
    f = addM(f, -p, a);
    j++;
  }
  const iso = (d) => d.toISOString().slice(0, 10),
    b2 = Object.assign({}, b, { d: iso(addM(f, -2 * p, a)) });
  if (b.q) b2.q = [iso(f), b.q[1] + j];
  else {
    const pre = [];
    let x = S[0];
    for (let k = 0; k < j; k++) {
      x = addM(x, -p, a);
      pre.unshift(iso(x));
    }
    b2.x = pre.concat(b.x);
  }
  if (b.ca) {
    b2.ca = [[Math.round(((100 * (b.c || 0)) / (12 / p)) * 1e10) / 1e6, j]].concat(b.ca);
    b2._ca = undefined;
  }
  return calc(b2, px, st);
}
const caArr = (b) => {
  if (b._ca) return b._ca;
  const o = [];
  b.ca.forEach((x) => {
    for (let i = 0; i < x[1]; i++) o.push(x[0]);
  });
  b._ca = o;
  return o;
};
const mdf = (x, y) => (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
function callView(b, st) {
  if (!b.ca || !b.cd) return null;
  const cd = D(b.cd);
  if (!(T(cd) > T(st))) return null;
  let s0 = null;
  const S = sched(b),
    C = caArr(b);
  if (!S.length || C.length !== S.length) return null;
  if (b.m && T(cd) >= T(S[S.length - 1])) return null;
  let n = 0;
  while (n < S.length && T(S[n]) <= T(cd)) n++;
  const dates = S.slice(0, n),
    am = C.slice(0, n);
  if (n === 0 || T(S[n - 1]) !== T(cd)) {
    if (n >= S.length) return null;
    const p = b.p,
      f = p ? 12 / p : 1,
      a = gd(S[0]),
      dc = b.dc,
      e = S[n],
      isReg = (x, y) => p > 0 && mdf(x, y) === p && Math.abs(gd(y) - gd(x)) <= 5;
    let s;
    if (n > 0) s = S[n - 1];
    else {
      const q = fcInfo(b, S),
        iss = D(b.d);
      s = q.lf || !p ? iss : new Date(Math.max(T(iss), T(q.r)));
      s0 = s;
    }
    let fr =
      dc === "30E"
        ? d360(s, cd) / (p > 0 && isReg(s, e) ? 360 / f : d360(s, e))
        : dc === "AA"
          ? act(s, cd) / (p > 0 && isReg(s, e) ? act(s, addM(s, p, a)) : act(s, e))
          : act(s, cd) / act(s, e);
    if (!isFinite(fr)) fr = 0;
    dates.push(cd);
    am.push(C[n] * fr);
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  return Object.assign({}, b, {
    x: dates.map(iso),
    q: undefined,
    ca: am.map((v) => [v, 1]),
    _ca: am,
    _cv: 1,
    _a0: n === 0 ? iso(s0) : undefined,
  });
}
function resetD(b) {
  if (b.m || !b.ca || !b.cd) return null;
  const C = caArr(b),
    S = sched(b);
  if (C.length !== S.length) return null;
  for (let i = 2; i < C.length; i++) if (Math.abs(C[i] - C[i - 1]) > 1e-6) return S[i - 1];
  return null;
}
function resetView(b, st) {
  const r = resetD(b);
  if (!r || !(T(r) > T(st))) return null;
  const S = sched(b),
    C = caArr(b),
    n = S.findIndex((d) => T(d) === T(r)) + 1,
    iso = (d) => d.toISOString().slice(0, 10);
  return Object.assign({}, b, {
    x: S.slice(0, n).map(iso),
    q: undefined,
    ca: C.slice(0, n).map((v) => [v, 1]),
    _ca: C.slice(0, n),
    cd: iso(r),
    cp: 100,
    _rv: 1,
    _a0: undefined,
  });
}
const modeSet = (b, st) => {
  if (!b.ca || !b.cd) return null;
  const cd = D(b.cd);
  if (!(T(cd) > T(st))) return null;
  if (b.m) return T(cd) < T(D(b.m)) ? "cm" : null;
  const r = resetD(b);
  if (r && T(r) > T(cd)) return T(r) > T(st) ? "cr" : null;
  const S = sched(b);
  return S.length && T(S[S.length - 1]) > T(cd) ? "cm" : null;
};
const callable = (b, st) => !!(b.ca && b.cd && b.m && T(D(b.cd)) > T(st) && T(D(b.cd)) < T(D(b.m)));

/* ===== Dışarıya açılan arayüz ===== */
const toDate = (x) => (x instanceof Date ? x : D(String(x).slice(0, 10)));

/** Verinin (Excel nakit akışının) çekildiği tarih. Kupon takvimi bu tarihe göre kurulur. */
function setDataDate(iso) {
  DD = T(toDate(iso));
}

/** Kıymet için seçilebilir hesap seçenekleri: "cm" = Call'a / Vadeye, "cr" = Call'a / (perp) ikinci seçenek, null = tek hesap. */
function availableModes(bond, settlement) {
  return modeSet(bond, toDate(settlement));
}

/**
 * Tek çağrıda fiyat / getiri / birikmiş faiz / nakit akışı.
 * girdi: { price (temiz fiyat, 100 nominal) VEYA yield (yıllık, ondalık: 0.12 = %12),
 *          settlement (takas tarihi, Date veya "YYYY-MM-DD"), nominal (opsiyonel),
 *          mode: "c" call'a (varsayılan) | "m" vadeye | "r" perp için ilk yeniden belirleme }
 * çıktı: { error } veya { cleanPrice, dirtyPrice, accrued, yield, amount, flows, endDate, ... }
 */
function analyze(bond, input) {
  const st = toDate(input.settlement);
  const mode = input.mode || "c";
  const hasY = input.yield != null;
  const r = calc(bond, hasY ? 100 : input.price, st, hasY ? input.yield : undefined, mode);
  if (r.err) return { error: r.err };
  const nominal = input.nominal != null ? input.nominal : null;
  return {
    cleanPrice: r.px,
    dirtyPrice: r.dirty,
    accrued: r.ai,
    yield: r.y,
    amount: nominal != null ? (r.dirty / 100) * nominal : null,
    flows: r.flows.map((f) => ({ date: f.d, coupon: f.cpn, principal: f.pr })),
    endDate: r.end,
    redemptionPrice: r.pp,
    raw: r,
  };
}

/** Müşteri tutarından nominal: katın (varsayılan 1000) tam katına aşağı yuvarlanır. */
function nominalForAmount(amount, dirtyPrice, step = 1000) {
  return Math.floor(amount / (dirtyPrice / 100) / step + 1e-9) * step;
}

export {
  analyze,
  calc,
  hcalc,
  sched,
  callView,
  resetView,
  resetD,
  modeSet,
  callable,
  setDataDate,
  availableModes,
  nominalForAmount,
  stdSt,
  nextBD,
  D,
  T,
  addM,
  act,
  d360,
};
