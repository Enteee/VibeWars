var e=`# Bot

**Bot** adalah pemain yang dimainkan game untukmu. Di lobi yang kamu host, bot
mengisi setiap tempat yang tidak diambil siapa pun, jadi kamu bisa berlatih, atau bermain dengan
lebih sedikit teman.

## Siapa yang dimainkan bot

Tidak ada yang menambahkan bot: lobi hanya menampilkan orang-orangnya. Saat
[Lobi Tim](modes.md#lobi-tim) berakhir, setiap sisi memainkan Build Tim yang
dipilihnya, dan setiap karakternya yang tidak diklaim siapa pun dimainkan oleh bot,
dengan nama karakter itu. Sisi yang tidak ada orangnya memainkan tim
preset acak, semuanya bot. Orang yang keluar selama Lobi Tim menyerahkan
karakternya kepada bot.

Di lobi dan di Lobi Tim, bot terlihat seperti pemain lain. Di dalam
laga, bot diberi tag **BOT** di papan namanya, bingkai target, jendela
party dan ringkasan laga.

Bot dibuat untuk satu laga: begitu laga selesai, lobi kembali menampilkan
orang-orangnya, dan bot untuk laga berikutnya dibuat dari awal.

## Cara bot bertarung

Bot memainkan peran yang diberikan build-nya. Bot yang memegang senjata jarak dekat adalah
**garis depan**: ia mendekat dan menyerang targetnya. Bot yang punya dua atau lebih
penyembuhan atau perlindungan yang bisa dirapal pada sekutu adalah **penyembuh**: ia berdiri
di belakang sekutu mana pun yang paling terluka, jauh dari musuh. Saat dua atau lebih
musuh mengeroyok satu sekutu, penyembuh memasang perlindungannya pada sekutu itu sebelum
pukulan mendarat. Penyembuh menyisakan cukup Energi untuk penyembuhan atau perlindungan
termurahnya, dan hanya memakai di bawah itu untuk sekutu yang benar-benar dalam
bahaya. Bot dengan dua kutukan menaruh kutukan murahnya di atas kutukan
pentingnya, sehingga penghapusan kutukan milik musuh mengambil yang murah lebih
dulu. Bot dengan skill penguras Energi membakar Energi penyembuh musuh, bukan
Energi Warrior.
Setiap bot lainnya adalah **jarak jauh**: ia menjaga posisi di mana semua
serangannya mencapai sasaran, dan berdiri melawan musuh yang datang terlalu dekat. Bot jarak jauh
dan penyembuh bergeser ke tempat yang lebih sedikit dijangkau musuh, dan memakai pilar
sebagai perlindungan. Sebuah tim berbalik menyerang musuh mana pun dalam jangkauan yang Darah-nya turun di bawah 60%,
untuk menghabisinya. Di Raja Bukit, selama timmu tidak menguasai
altar, Ghostly Hero tim lawan di altar didahulukan bahkan dari itu.
Dalam tim yang seluruhnya bot, bot yang terlalu jauh di depan timnya menunggu
sisanya sebelum terus maju. Bot di timmu justru tetap bersamamu: garis depan
selangkah di depan, jarak jauh di sampingmu, penyembuh di belakang, dan mereka
mengikuti ke mana pun kamu pergi. Begitu kamu sudah diam beberapa lama, mereka
terus bermain seperti tim yang seluruhnya bot.
Selama kamu aktif, bot yang terseret pertarungan jauh darimu berjalan kembali kepadamu, kecuali ia terluka parah atau ada lawan tepat di dekatnya.
Bot garis depan berbalik menyerang musuh yang menyerang penyembuh atau perapal mantra timnya, kecuali ia hampir menghabisi targetnya sendiri.
Bot yang punya mantra area menjatuhkannya di tempat tiga musuh atau lebih berdiri berdekatan, kecuali timnya sedang menghabisi musuh atau mengikuti target yang ditandai.
Bot dengan skill yang melumpuhkan atau memperlambat memakainya pada lawan di sampingnya, atau pada lawan yang menyerbu healer atau caster timnya, sebelum target tim.

Melawan tim dengan skill area, bot jarak jauh dan healer saling menjaga jarak, agar satu ledakan tidak mengenai dua dari mereka. Mereka tidak pernah melepas perlindungan untuk itu.

Bot jarak jauh atau penyembuh yang didekati musuh terlalu dekat lebih dulu mundur ke rekan garis depan terdekatnya, jika ada yang cukup dekat, lalu bertarung di sana. Penyerang jarak dekat yang diperlambat, misalnya Crippled, tidak bisa mengejar, jadi terhadapnya bot justru mundur di sela tembakan.

Bot yang terkena kutukan yang menghukum serangan atau perapalan mantra, seperti Empathy atau Backfire, berhenti melakukannya sampai kutukan itu berakhir.

Pemanah dan pelempar tombak mengambil tempat tinggi saat aman.
Bot yang diincar dua lawan, atau yang nyawanya di bawah separuh dan cepat berkurang, bersembunyi dari pandangan mereka hingga tiga detik: di balik dinding, di bawah dek, atau di tempat tinggi.
Saat tidak ada lawan di dekatnya, bot menarik tuas yang membuka jalan lebih pendek ke arah lawan. Dua bot juga merobohkan tembok yang menyembunyikan jalan yang jauh lebih pendek, dengan memukulnya memakai senjata mereka.

Bot penyerang menahan pukulan besarnya, skill serangan dan mantra damage,
lalu melepaskannya bersamaan ke target tim, jadi damage-nya mendarat sekaligus
alih-alih menetes sedikit demi sedikit untuk dipulihkan penyembuh: mantra paling lambat jalan
lebih dulu, yang lebih cepat menyusul sebanyak selisih kecepatannya. Sementara itu mereka terus
mengayun dan merapal kutukan serta kondisi mereka. Bot menunggu rekan setimnya paling lama empat
detik, dan sama sekali tidak menunggu untuk menghabisi musuh yang Darah-nya di bawah
30%. Saat target berada di bawah berkah pelindung seperti
Protective Spirit atau Aegis, bot yang punya skill pelucut berkah, seperti Strip
Enchantment, melepasnya dulu, dan yang lain menahan pukulan mereka untuk itu.
Jika tim tidak punya pelucut berkah, bot meninggalkan musuh yang terlindungi
dan beralih ke musuh lain sampai berkahnya habis.

Bot yang terluka parah dan sedang kalah bertarung mundur ke belakang penyembuhnya, atau
ke markasnya, dan beristirahat di luar jangkauan sampai sebagian besar Darah-nya pulih.

Bot membangkitkan sekutu yang tumbang hanya kalau musuh tidak sedang mengerubungi
jasadnya, lebih banyak anggota timnya sendiri daripada tim lawan yang berdiri di dekatnya, dan tidak pernah
selagi ada musuh di dekat situ yang sedang menargetkan bot itu sendiri.

Bot menghindar ke samping dari sekitar separuh skill shot yang diarahkan kepadanya, seperti
Fireball atau anak panah skill serangan, jadi berhenti atau berbelok bekerja untuk
mereka seperti halnya untukmu.

Bot memutari tanah yang terbakar dan petak berbahaya lain bila jalan
memutarnya tidak jauh lebih panjang, dan keluar dari petak yang mereka
injak.
Bot juga keluar dari area berbahaya milik lawan, seperti sumur, pelindung yang menangkal mereka, atau badai, lalu bertarung dari tepinya.

Bot yang punya interupsi menyimpannya untuk rapalan yang penting: kebangkitan
atau Ghostly Hero yang sedang merebut altar lebih dulu, lalu penyembuhan atau
perlindungan, skill elite, atau pukulan
besar seperti skill serangan atau mantra damage. Ia membiarkan semua yang lain,
dan pukulan senjata biasa, lewat. Seperti pemain, ia meleset sekitar satu
dari empat rapalan itu.

Bot butuh jeda seperti manusia, sepersekian detik, untuk bereaksi terhadap
apa yang terjadi, jadi interupsi cepat atau menghindar di detik terakhir bisa mengalahkannya.

Saat tidak ada seorang pun di timmu yang mengumumkan target, salah satu botmu mengumumkan musuh yang
sedang difokuskan oleh bot-botmu, sama seperti yang akan kamu lakukan: kamu melihat penandanya dan
nama bot itu, jadi kamu bisa ikut menyerang. Pengumuman dari bot hanya menunjukkan ke mana bot-bot itu
pergi; mereka tetap melindungi rekan setim dan menghabisi musuh yang sekarat. Pengumumanmu selalu
menang: setiap bot di tim memusatkan serangan ke targetmu, tidak ada bot yang mengganti pengumumanmu,
dan bot baru mengumumkan lagi setelah target itu mati atau hilang.

Dalam pertarungan tiga tim, bot melawan satu tim musuh
pada satu waktu: tim yang menyerang mereka, atau, selama tidak ada yang menyerang, tim yang paling terluka
dalam jangkauan. Mereka tetap pada tim itu sampai tim lain jelas mengerahkan lebih banyak
pemain ke arah mereka, dan tidak menyerbu tim yang masih segar selagi tim lain sedang
menyerang mereka. Target yang diumumkan tim mereka didahulukan, dari tim mana pun
target itu. Hanya pemain yang dihitung: hantu atau penjaga sebuah tim yang berdiri di dekat situ
tidak membuat bot berbalik menyerang tim itu.

## Arena Acak

Arena Acak tidak punya bot: setiap tempat diisi pemain sungguhan, dan kamu menunggu
sampai cukup banyak yang mengantre.
`;export{e as default};
//# sourceMappingURL=bots-Czktbvze.js.map