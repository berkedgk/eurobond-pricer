# Hesaplama formülleri

Formüller `engine/eurobond-hesap.js` dosyasının başında ve `src/index.html` dosyasının başındaki açıklama bloğunda da yer alır.

- Gün sayımı: 30E/360, ACT, ACT/ACT, ACT/360, ACT/365
- Kupon, birikmiş faiz, kirli fiyat ve tutar
- Getiri (YTM): kirli fiyat = Σ (kupon + anapara) / (1 + y/f)^X, ikiye bölme yöntemiyle çözülür
- Call ve perpetual (vadesiz) kıymet seçenekleri
- Müşteri tutarından nominal (1.000'in katı)

Doğrulama durumu: birikmiş faiz bir kıymette (XS1772390628) Bloomberg YAS ile birebir tuttu; aynı kıymette getiri YAS'tan 4,6 baz puan farklı çıktı, nedeni bulunamadı. Diğer kıymetler karşılaştırılmadı. Resmî kullanımdan önce kurumun yöntemiyle karşılaştırın.
