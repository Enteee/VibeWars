# Bot

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
pukulan mendarat. Setiap bot lainnya adalah **jarak jauh**: ia menjaga posisi di mana semua
serangannya mencapai sasaran, dan berdiri melawan musuh yang datang terlalu dekat. Bot jarak jauh
dan penyembuh bergeser ke tempat yang lebih sedikit dijangkau musuh, dan memakai pilar
sebagai perlindungan. Sebuah tim berbalik menyerang musuh mana pun dalam jangkauan yang Darah-nya turun di bawah 60%,
untuk menghabisinya. Di Raja Bukit, selama timmu tidak menguasai
altar, Ghostly Hero tim lawan di altar didahulukan bahkan dari itu.
Bot yang terlalu jauh di depan timnya menunggu sisanya sebelum terus
maju.

Pemanah dan pelempar tombak mengambil tempat tinggi saat aman.
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

Bot yang punya interupsi menyimpannya untuk rapalan yang penting: kebangkitan
atau Ghostly Hero yang sedang merebut altar lebih dulu, lalu penyembuhan atau
perlindungan, skill elite, atau pukulan
besar seperti skill serangan atau mantra damage. Ia membiarkan semua yang lain,
dan pukulan senjata biasa, lewat. Seperti pemain, ia meleset sekitar satu
dari empat rapalan itu.

Bot butuh jeda seperti manusia, sepersekian detik, untuk bereaksi terhadap
apa yang terjadi, jadi interupsi cepat atau menghindar di detik terakhir bisa mengalahkannya.

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
