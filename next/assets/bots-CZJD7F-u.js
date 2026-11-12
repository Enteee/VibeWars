var e=`# Botlar

**Bot**, oyunun senin yerine oynattığı bir oyuncudur. Kurduğun bir
lobide kimsenin almadığı her yeri botlar oynar; böylece pratik
yapabilir ya da daha az arkadaşla oynayabilirsin.

## Botu kim oynar

Kimse bot eklemez: bir lobi yalnızca insanlarını listeler.
[Takım Lobisi](modes.md#takım-lobisi) bitince her taraf seçtiği Takım
Dizilimini oynar ve onun kimsenin almadığı her karakterini, o
karakterin adı altında bir bot oynar. Kimsenin olmadığı bir taraf,
tamamı botlardan oluşan rastgele hazır bir takım oynar. Takım Lobisi
sırasında ayrılan biri karakterini bir bota bırakır.

Lobide ve Takım Lobisi'nde bir bot herkes gibi görünür. Maçta ad
plakasında, hedef çerçevesinde, grup penceresinde ve maç özetinde
**BOT** etiketi taşır.

Botlar tek bir maç için yapılır: maç bitince lobi yine insanlarını
listeler ve sonraki maçın botları baştan yapılır.

## Botlar nasıl dövüşür

Bir bot, diziliminin ona verdiği rolü oynar. Yakın dövüş silahı
kullanan bir bot **ön saf**tır: yaklaşır ve hedefine saldırır. Bir
müttefike yapabileceği iki ya da daha fazla iyileştirmesi veya koruması
olan bir bot **şifacı**dır: en çok yaralanan müttefikin arkasında,
düşmanlardan uzakta durur. İki ya da daha fazla düşman tek bir müttefike
yüklendiğinde şifacı, darbe inmeden önce korumasını o müttefike koyar.
Diğer her bot **menzilli**dir: tüm saldırılarının erişebildiği yerde
durur, çok yaklaşan bir düşmanla da yerinde durup dövüşür. Menzilli
botlar ve şifacılar daha az düşmanın erişebileceği yere geçer ve
sütunları siper olarak kullanır. Bir takım, onu bitirmek için erişimdeki
canı %60'ın altına düşen her düşmana yönelir. Tepenin Kralı'nda, takımın
sunağı elinde tutmuyorken, diğer takımın sunaktaki Ghostly Hero'su bundan
bile önce gelir. Takımının çok önüne geçen bir bot, ilerlemeden önce
diğerlerini bekler.

Yakında düşman yoksa bot, düşmanlara daha kısa bir yol açan kolu çeker.

Hasar veren botlar büyük vuruşlarını, saldırı becerilerini ve hasar
büyülerini bekletir ve hepsini birlikte takımın hedefine ateşler; böylece
hasar, bir şifacının geri alabileceği şekilde damla damla değil, bir
anda iner: en yavaş büyü önce gider, daha hızlısı ne kadar hızlıysa o
kadar sonra. Bu arada savurmaya ve lanetlerini, rahatsızlıklarını
yapmaya devam ederler. Bir bot takım arkadaşlarını en fazla dört saniye
bekler ve canı %30'un altındaki bir düşmanı bitirmek için hiç beklemez.
Hedef Protective Spirit ya da Aegis gibi koruyucu bir tılsımın
altındaysa, Strip Enchantment gibi tılsım sökme becerisi olan bir bot
önce onu söker, diğerleri de vuruşlarını onun için bekletir.

Dövüşü kaybeden ağır yaralı bir bot şifacısının arkasına ya da üssüne
çekilir ve canının çoğu geri gelene kadar erişim dışında dinlenir.

Bir bot düşmüş bir müttefiki yalnızca düşmanlar bedenin tepesinde
değilken, yakınında kendi takımından onlarınkinden daha çok kişi
dururken diriltir; yakındaki bir düşman botun kendisini hedef alıyorsa
asla diriltmez.

Botlar kendilerine yöneltilen, Fireball ya da bir saldırı becerisinin
oku gibi beceri atışlarının yaklaşık yarısından yana kaçar; yani durmak
ya da dönmek onlara karşı da sana karşı olduğu gibi işe yarar.

Botlar, dolaşmak çok daha uzun değilse yanan zeminin ve diğer zararlı
alanların çevresinden dolaşır, içinde durdukları alandan da çıkarlar.

Kesintisi olan bir bot onu önemli yapımlar için saklar: önce bir
diriliş ya da sunağı ele geçiren bir Ghostly Hero, sonra bir
iyileştirme ya da koruma, elit bir beceri ya da saldırı becerisi veya
hasar büyüsü gibi büyük bir vuruş. Diğer her şeyin ve sıradan bir silah
darbesinin geçmesine izin verir. Bir oyuncu gibi, bu yapımların
yaklaşık dörtte birini kaçırır.

Bir bot, olanlara tepki vermek için insan gibi bir an, saniyenin bir
kesri kadar süre alır; bu yüzden hızlı bir kesinti ya da geç bir kaçış
onu alt edebilir.

Üç takımlı bir dövüşte botlar aynı anda tek bir düşman takımıyla
dövüşür: onlara saldıran takımla ya da kimse saldırmıyorken erişimdeki
en yaralı takımla. Başka bir takım açıkça daha fazla oyuncuyu üzerlerine
salana kadar o takımda kalırlar ve başka biri onlara saldırırken taze
bir takıma hücum etmezler. Takımlarının bildirdiği bir hedef, hangi
takımda olursa olsun, önce gelir. Yalnızca oyuncular sayılır: bir
takımın yakında duran hayaleti ya da muhafızları botları o takıma
yöneltmez.

## Rastgele Arena

Rastgele Arena'da bot yoktur: her yer gerçek bir oyuncudur ve yeterince
kişi sıraya girene kadar beklersin.
`;export{e as default};
//# sourceMappingURL=bots-CZJD7F-u.js.map