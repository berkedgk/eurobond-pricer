# Eurobond Pricer

Eurobond fiyat ve getiri hesaplama sayfası. Düz HTML, CSS ve JavaScript; derleme adımı ve harici bağımlılık yoktur.

## Yapı
- `src/index.html` : sayfanın tamamı (arayüz, hesap motoru, gömülü kıymet verisi). Dosya başında yapı ve formüller açıklanmıştır.
- `engine/` : ekrandan bağımsız hesap motoru (ES modülü), örnek kıymetler, beklenen sonuçlar ve test. `cd engine && node test.mjs` (Node 18+).
- `docs/FORMULLER.md` : formüllerin özeti.

## Çalıştırma
`src/index.html` dosyasını tarayıcıda açmak yeterlidir.
Not: Sayfa fiyatları ve haberleri dış bir servisten (Worker) almaya çalışır. Kurum ortamında bu adres bulunmayacağı için fiyatlar boş gelir. Fiyat ve kıymet kaynağı kurumun kendi servisine bağlanmalıdır. Hesap sayfası kıymet detayıyla çalışmaya devam eder.

## Kıymet verisi
`src/index.html` içinde `/*B0*/ ... /*B1*/` arasında, her satırı bir kıymet olan `B` dizisi bulunur. Alanların anlamı dosya başındaki açıklamadadır.

## Bilinen noktalar
- Floating/değişken kuponlu kıymetlerde güncel kupon sabit kabul edilir; amortismanlı yapılar modelde yoktur.
- Dış bağlantılar: fiyat/haber servisi ve yönetim bölümündeki Excel okuma kütüphanesi (internetten yüklenir). Kurum sürümünde bunların kaldırılması veya yerelleştirilmesi gerekir.
- Fiyatlama bilgilerinin tamamı indikatiftir.
