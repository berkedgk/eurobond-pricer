// Çalıştırma: node test.mjs
// Motorun sonuçlarını, "beklenen-sonuclar.json" içindeki (mevcut sitenin ürettiği) değerlerle karşılaştırır.
import { readFileSync } from "node:fs";
import { analyze, setDataDate, availableModes, nominalForAmount } from "./eurobond-hesap.js";

const bonds = JSON.parse(readFileSync(new URL("./ornek-kiymetler.json", import.meta.url)));
const exp = JSON.parse(readFileSync(new URL("./beklenen-sonuclar.json", import.meta.url)));
setDataDate(exp.dataDate);

let fail = 0, n = 0;
const eq = (a, b, tol = 1e-9) => (a == null && b == null) || Math.abs(a - b) <= tol;
const check = (ok, msg) => { n++; if (!ok) { fail++; console.log("HATA:", msg); } };

for (const c of exp.cases) {
  const b = bonds.find((x) => x.i === c.isin);
  const r = analyze(b, { price: c.price, settlement: c.settlement, mode: c.mode });
  const tag = `${c.isin} mod=${c.mode} fiyat=${c.price}`;
  if (c.err) { check(!!r.error, tag + " hata beklendi"); continue; }
  check(!r.error, tag + " hata verdi: " + r.error);
  if (r.error) continue;
  check(eq(r.yield, c.yield), `${tag} getiri ${r.yield} != ${c.yield}`);
  check(eq(r.accrued, c.accrued), `${tag} birikmiş faiz ${r.accrued} != ${c.accrued}`);
  check(eq(r.dirtyPrice, c.dirty), `${tag} kirli fiyat`);
  check(r.flows.length === c.n, `${tag} akış sayısı ${r.flows.length} != ${c.n}`);
  check(r.endDate.toISOString().slice(0, 10) === c.end, `${tag} bitiş tarihi`);
  // gidiş-dönüş: getiriden fiyata, aynı temiz fiyatı vermeli
  const back = analyze(b, { yield: r.yield, settlement: c.settlement, mode: c.mode });
  check(eq(back.cleanPrice, c.price, 1e-6), `${tag} getiriden fiyata ${back.cleanPrice}`);
}
// nominal yuvarlama: 321.210 USD tutar, kirli fiyat 100,5 -> nominal 1000 katı, tutar aşılmamalı
const nom = nominalForAmount(321210, 100.5);
check(nom % 1000 === 0 && (nom * 100.5) / 100 <= 321210, "nominal yuvarlama");
check(availableModes(bonds.find((x) => x.i === "XS2778918834"), "2026-11-06") === "cm", "mod seti");

console.log(`${n} kontrol, ${fail} hata`);
process.exit(fail ? 1 : 0);
