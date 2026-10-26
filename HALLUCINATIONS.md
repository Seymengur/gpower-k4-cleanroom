# Halüsinasyon ve Hata Raporu (HALLUCINATIONS.md)

## Argon'un Temiz Oda (Clean Room) Hatası: "Off-by-One" Sınır Değeri Bug'ı

Tersine mühendislik sürecinde, kuralları kodlayan Argon geliştiricisinin `src/engine.ts` dosyasında kritik bir sınır değeri hatası (off-by-one bug) yaptığı tespit edilmiştir.

### Hataya Dair Bulgular:
Yapay Zeka (AI Agent) testleri sırasında, hekimin "İlaç ve plasebo olmak üzere 2 grubumuz var" şeklindeki girdisinden yola çıkan ajan, doğru bir mantıkla serbestlik derecesini (df) `1` olarak belirlemiş ve K4 motorunu `df: 1` parametresiyle çağırmıştır. 

Ancak K4 motoru bu çağrıya şu hatayla yanıt vermiştir:
`Hata: Degrees of Freedom must be greater or equal one.`

### Kök Neden Analizi:
SPEC.md dosyasındaki yönerge açıkça `df >= 1` (Serbestlik derecesi 1 veya 1'den büyük olmalıdır) kuralını belirtmesine rağmen, Argon girdi doğrulama (validation) fonksiyonunu yazarken şu hatalı koşulu kullanmıştır:

```typescript
// HATALI KOD (engine.ts - satır 241)
if (df <= 1.0) {
    throw new ValidationError('Degrees of Freedom must be greater or equal one.');
}
```
Bu kod, `df` değeri tam olarak `1` olduğunda da hata fırlatarak tamamen geçerli ve yasal bir istatistiksel senaryoyu (örneğin 2x2 ki-kare tabloları) sistemden dışlamaktaydı.

### Çözüm:
Hatalı `<=` (küçük eşittir) operatörü, `<` (küçüktür) operatörü ile değiştirilerek motor düzeltilmiş ve 1 serbestlik derecesiyle yapılan hesaplamalar başarıyla G*Power ile (Oracle) %100 uyumlu hale getirilmiştir.

```typescript
// DÜZELTİLMİŞ KOD
if (df < 1.0) {
    ...
}
```
