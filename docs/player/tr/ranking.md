# Derecelendirme

## Neyin dereceli olduğu

Kuyruktan gelen ve içinde bot olmayan her maç derecelidir: Rastgele Arena
ve Takım Arenası. Özel Oyun, eğitim alanı ve içinde bot olan her maç
derecesizdir. Bunun için bir anahtar ya da ayrı bir kuyruk yoktur.
Dereceli bir maç boş bir koltuğu asla botla doldurmaz.

## Puanın

Puanın, bu tarayıcının sakladığı oyuncu anahtarına aittir. Bu tarayıcıda
oynadığın her karakter aynı puanı paylaşır.

Dereceli kuyruklar benzer puandaki oyuncuları eşleştirir ve onları
ortalama puanı benzer takımlara böler. Arama puanının 100 puan
yakınında başlar ve beklediğin her saniye için 10 puan genişler, 600'e
kadar, böylece kimse sonsuza dek beklemez. Beklerken kuyruk puanını
gösterir.

İlk 10 puanlı maçın geçicidir: kuyruk **Geçici (3/10 maç)** der ve henüz
sıran yoktur. Ondan sonra ana menü sıranı gösterir. Puanlar aşınır:
puanlı maçsız geçen her gün seninkini daha belirsiz yapar ve lider
tablosu temkinli bir değere göre sıralar, bu yüzden oynamayı bırakırsan
sıran haftalar içinde düşer.

Lider tablosunda 20 yerleşik oyuncu olduğunda, dereceli bir maç ancak
içindeki en az bir oyuncu yerleşikse sayılır (10 veya daha fazla puanlı
maç): yalnızca yeni oyuncular arasındaki bir maç puansızdır. Yerleşik
biriyle oyna, maçların sayılsın.

Üst çubuktaki **Lider tablosu** düğmesi ilk 100'ü sıra, ad ve puana göre
listeler, kendi satırın vurgulanır.

Kahraman rütbesi (★) bu puan değildir: şöhretten gelir, bkz.
[Kahramanların Yükselişi](modes.md#kahramanların-yükselişi).

## Maçın başlaması

Dereceli bir maç bulunduğunda herkes 15 saniye içinde onaylar ve ekran
**Dereceli maç onaylanıyor…** yazar. Biri onaylamazsa maç iptal edilir ve
herkes kuyruğa döner.

## Maçın bitmesi

Sonunda herkes sonucu 30 saniye içinde imzalar. İmzalamamak ayrılmak
sayılır ve dereceli bir maçtan ayrılmak yenilgi sayılır, ev sahibinin
ayrılması da. Ayrıl düğmesi bunu söyler. Bir sonuç yalnızca koltukların
yarısından fazlası imzaladığında sayılır.

## Neler yayımlanır

Maçın makbuzu herkese açık Nostr rölelerine gider. İçinde her oyuncunun
açık anahtarı ve karakter adı (karakteri olmayan oyuncu starter olarak
geçer) ve kimin kime karşı oynadığı vardır. Herkes okuyabilir ve geri
alınamaz. Derecesiz maçlar hiçbir şey yayımlamaz.

## Ne zaman güncellenir

Puanın bir saat içinde değişir ve lider tablosu da onunla birlikte.
