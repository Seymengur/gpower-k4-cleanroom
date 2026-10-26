# G*Power K4 (Chi-Squared Contingency) - Clean Room Implementation

## Proje Özeti
Bu proje, G*Power yazılımının "Goodness-of-fit tests: Contingency tables" (K4) modülünün **%100 matematiksel uyumlulukla** tersine mühendislik (Clean Room) yöntemiyle TypeScript dilinde yeniden gerçeklenmesidir. 

Nurettin Hoca'nın yönergeleri doğrultusunda, Kâhin'in (G*Power) gizli yuvarlama (pre-rounding $10^{-10}$) algoritmaları, asimetrik sınır bulma (bracket) ve Brent-Dekker kök bulma algoritmaları kusursuz bir şekilde entegre edilmiştir. Ayrıca projeye, hekimlerin klinik sorularını doğal dilde anlayıp K4 motoruna ileten bir **Yapay Zeka (AI Agent / MCP) Katmanı** (Gemini API kullanılarak) eklenmiştir.

## Teknik Özellikler
*   **İstatistik Motoru:** `jStat` bağımlılıklarının ötesine geçilerek, yüksek hassasiyetli (IEEE-754) log-gamma ve Poisson tabanlı iterasyon fonksiyonları kullanılmıştır.
*   **Gizli Kural Tespiti:** G*Power'ın N hesaplamasında kullandığı `N_final = ceil(floor(N_raw * 1e10 + 0.5) / 1e10)` algoritması başarıyla deşifre edilmiş ve koda eklenmiştir.
*   **Test Vektörleri (Oracle):** `oracle/` klasörü altında, G*Power arayüzünden manuel olarak alınmış 30 adet doğrulama ekran görüntüsü (Kâhin Kanıtları) ve `.csv` dosyası bulunmaktadır. Tüm testler orijinal yazılımla birebir aynı N ve Gerçek Güç (Actual Power) değerlerini üretmektedir.
*   **Yapay Zeka Katmanı:** `@google/genai` SDK'sı ile `gemini-3.8-flash` modeli kullanılarak tıbbi bir ajan ayağa kaldırılmış ve fonksiyon çağrıları (Tool Calling) ile yerel `engine.ts` motorumuza bağlanmıştır.

## Kurulum ve Çalıştırma
```bash
# Bağımlılıkları yükle
npm install

# Yapay Zeka Ajanını Başlat (Tıbbi Chatbot Arayüzü)
npx tsx src/agent.ts
```
