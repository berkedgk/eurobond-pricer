# Eurobond hesap motoru (JavaScript modülü)

Ekrandan bağımsız, saf JavaScript. Tarayıcıda ve Node.js'te çalışır; internet bağlantısı veya dış kütüphane gerektirmez.

## Dosyalar
- `eurobond-hesap.js` : motor (ES modülü). Başında formüllerin açıklaması vardır.
- `ornek-kiymetler.json` : 8 örnek kıymet (30E, ACT/ACT, ACT/360, call'lu, perpetual).
- `beklenen-sonuclar.json` : mevcut sitenin aynı kıymetler için ürettiği sonuçlar.
- `test.mjs` : motoru bu sonuçlarla karşılaştırır. Çalıştırma: `node test.mjs` (Node 18+).
- `package.json` : `"type": "module"`.

## Kullanım
```js
import { analyze, setDataDate, availableModes, nominalForAmount } from "./eurobond-hesap.js";

setDataDate("2026-11-04");   // nakit akışı verisinin çekildiği tarih
const r = analyze(bond, { price: 99, settlement: "2026-11-06", nominal: 1000000, mode: "c" });
// r.yield (ondalık: 0.12 = %12), r.accrued, r.dirtyPrice, r.amount, r.flows[{date, coupon, principal}]
const g = analyze(bond, { yield: 0.12, settlement: "2026-11-06" });  // getiriden fiyata
const modlar = availableModes(bond, "2026-11-06"); // "cm" | "cr" | null
```
Hata durumunda `{ error: "..." }` döner (ör. takas tarihi akışın son tarihinden sonra).

`mode`: `"c"` call'a (varsayılan), `"m"` vadeye (perpetual'da 2099'a kadar), `"r"` perpetual için ilk yeniden belirleme tarihine kadar.
`availableModes` call'lu ve perpetual kıymetlerde seçenek sunulup sunulmayacağını söyler (null ise tek hesap vardır).

## Kıymet nesnesi
Alanlar `eurobond-hesap.js` dosyasının başında açıklanmıştır. Kupon tutarları (`ca`) 1.000.000 nominal içindir; motor 100 nominale çevirir.
Kendi veri kaynağınızdan aynı alanlara sahip bir nesne oluşturmanız yeterlidir.

## Dikkat edilecekler
- **Veri tarihi:** `setDataDate`, kupon takvimini kuran Excel nakit akışının çekildiği tarihtir. Veri yenilenince güncellenmelidir.
- **Doğrulama:** Birikmiş faiz XS1772390628'de Bloomberg YAS ile birebir tuttu. Aynı kıymette getiri YAS'tan 4,6 baz puan farklıdır (nedeni bulunamadı). Diğer kıymetler Bloomberg ile karşılaştırılmadı.
- **Varsayımlar:** Floating/değişken kuponlu kıymetlerde güncel kupon sabit kabul edilir. Amortismanlı yapılar modelde yoktur (ana para vadede ödenir).
- Tarihler UTC gece yarısı olarak işlenir; saat dilimi etkisi yoktur.
