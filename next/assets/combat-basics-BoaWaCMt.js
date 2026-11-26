var e=`# Dasar-dasar pertarungan

## Darah dan energi

Kamu mulai dengan 480 **Darah** dan 20 **Energi**, dan armormu menambah Energi:
tidak ada untuk Warrior, 5 untuk Ranger, Assassin, atau Dervish, 10 untuk yang
lain. Staff menambah 10 lagi selama kamu memegangnya. Armor Dervish juga menambah 25 Darah. Rune dan moral mengubah
keduanya. Skill memakan Energi, dan Energi pulih dengan sendirinya, perlahan. ![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior**
dan ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** memulihkannya paling lambat, ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger** sedikit lebih cepat, sisanya
paling cepat.

Panah-panah di bar-mu adalah **pip**: masing-masing berarti Darah atau Energi yang
pulih, atau terkuras, sedikit setiap detik. ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**, ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning** dan
![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison** menguras Darah; Regeneration dan mantra penyembuhan menambahnya. Setelah 5 detik
di luar pertarungan, Darah-mu mulai pulih sendiri, makin cepat
makin lama kamu berada di luar pertarungan.

## Adrenalin

![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** dan profesi lain punya skill yang memakan **adrenalin**
alih-alih Energi. Setiap skill seperti itu terisi sendiri-sendiri: setiap pukulan senjata
yang kamu daratkan memberi masing-masing satu strike, begitu juga saat kamu menerima pukulan besar. Memakai
salah satunya mengosongkannya dan mengambil satu strike dari yang lain. Setelah 25 detik
di luar pertarungan, semuanya kosong.

## Memakai skill

Sebuah skill bisa butuh waktu sejenak untuk **dirapal**, lalu butuh waktu
**cooldown** sebelum bisa dipakai lagi. Kalau targetmu di luar jangkauan,
kamu berjalan ke arahnya dulu. Bergerak, atau Esc, membatalkan rapalan: Energinya hilang,
tapi skill tidak masuk cooldown. Setelah skill apa pun yang punya waktu rapal, kecuali
![Skill serangan](../../../apps/web/public/icons/skill-type/attack.svg) **skill serangan**, ada jeda singkat saat kamu tidak bisa bertindak.

Skill yang kamu tekan selagi memakai skill lain, atau selama jeda itu, **diantrekan**:
skill itu jalan berikutnya, dan slotnya berdenyut sampai saatnya tiba. Hanya satu yang menunggu; menekan
skill lain menggantikannya. Bergerak, Esc, interupsi atau knockdown membuangnya.

![Teriakan](../../../apps/web/public/icons/skill-type/shout.svg) **Teriakan** dan ![Kuda-kuda](../../../apps/web/public/icons/skill-type/stance.svg) **kuda-kuda** tidak pernah diantrekan: keduanya langsung aktif, bahkan selagi
kamu merapal skill lain, selama jeda itu, atau saat terjatuh. Rapalan tetap
berjalan. Dipakai dengan cara itu, keduanya tidak membuatmu berjalan mendekat: di luar jangkauan, skill ditolak.

## Interupsi dan knockdown

**Interupsi** menghentikan skill musuh selagi mereka merapalnya. Energi
mereka terpakai dan skill masuk cooldown; sebagian interupsi juga mengunci
skill itu untuk sementara. Interupsi terlalu cepat atau terlalu lambat dan tidak terjadi apa-apa.

Setiap profesi punya suara sendiri saat memakai skill; dengarkan suara targetmu.

Kebanyakan interupsi juga menghentikan serangan biasa di tengah ayunan: pukulan itu tidak pernah
mendarat dan ayunan dimulai dari awal. Musuh yang masih berjalan menuju targetnya
tidak punya apa pun untuk diinterupsi. Interupsi yang kartunya bertuliskan "a skill" atau "a
spell" tidak mengganggu serangan biasa.

Sebagian ![Kuda-kuda](../../../apps/web/public/icons/skill-type/stance.svg) **kuda-kuda**, seperti Mantra of Concentration, menghentikan interupsi yang diarahkan
kepadamu. Tak satu pun menghentikan knockdown.

**Terjatuh**, kamu tidak bisa bergerak, menyerang atau memakai skill untuk sesaat,
kecuali ![Teriakan](../../../apps/web/public/icons/skill-type/shout.svg) **teriakan** atau kuda-kuda, dan rapalan yang sedang berjalan gagal.

## Kondisi, kutukan dan berkah

**Kondisi** melukaimu sampai habis atau dihapus:

| Kondisi                                                                                     | Efeknya                                                   |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**                | menguras Darah                                            |
| ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning**                   | menguras Darah dengan cepat                               |
| ![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison**                      | menguras Darah                                            |
| ![Disease](../../../apps/web/public/icons/status/disease.svg) **Disease**                   | menguras Darah, dan menular ke tubuh sejenis di sebelahmu |
| ![Crippled](../../../apps/web/public/icons/status/crippled.svg) **Crippled**                | kamu bergerak dengan setengah kecepatan                   |
| ![Blind](../../../apps/web/public/icons/status/blind.svg) **Blind**                         | kebanyakan seranganmu meleset                             |
| ![Weakness](../../../apps/web/public/icons/status/weakness.svg) **Weakness**                | pukulan senjatamu jauh lebih lemah                        |
| ![Cracked Armor](../../../apps/web/public/icons/status/cracked-armor.svg) **Cracked Armor** | armor berkurang                                           |
| ![Deep Wound](../../../apps/web/public/icons/status/deep-wound.svg) **Deep Wound**          | Darah maksimum berkurang, dan penyembuhan kurang manjur   |
| ![Dazed](../../../apps/web/public/icons/status/dazed.svg) **Dazed**                         | mantra dirapal lambat; serangan apa pun menginterupsinya  |

Antek (kecuali Golem Daging), hantu, dan roh tidak berdarah, tidak keracunan, dan tidak tertular penyakit, dan roh tidak terkena kutukan apa pun maupun kondisi apa pun selain **Burning**.

![Kutukan](../../../apps/web/public/icons/skill-type/hex.svg) **Kutukan** dirapal kepadamu oleh musuh; ![Berkah](../../../apps/web/public/icons/skill-type/enchantment.svg) **berkah** oleh dirimu sendiri atau
sekutumu. Masing-masing dihapus oleh jenis skill-nya sendiri. Sebagian berkah
**dipertahankan**: berkah itu bertahan sampai kamu mengakhirinya, memakan satu pip Energi selama
berjalan. Klik dua kali ikonnya, atau fokuskan ikon itu lalu tekan Enter atau
Delete, untuk mengakhirinya.

Beberapa skill berhenti bekerja selagi kamu diberkahi, dan bekerja lagi begitu
tidak lagi. Skill yang bertahan untuk "N serangan berikutnya" menghitung setiap
serangan, jadi serangan yang meleset atau ditangkis menghabiskan satu sama pastinya dengan yang kena.

## Armor dan damage

![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warrior** dan ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragon** memakai armor paling banyak; ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Ranger**, ![Assassin](../../../apps/web/public/icons/profession/assassin.svg) **Assassin** dan
![Dervish](../../../apps/web/public/icons/profession/dervish.svg) **Dervish** lebih sedikit; perapal paling sedikit. Armor memperkecil damage senjata, elemen, chaos
dan dark. Damage holy, shadow dan tanpa jenis, kuras Darah dan pencurian
nyawa mengabaikannya. Hanya pukulan senjata yang bisa kritis.
Sebagian berkah membuat pemakainya kebal terhadap pukulan kritis.

## Kematian, kebangkitan dan moral

Di kebanyakan mode yang mati tetap tergeletak sampai sekutu **membangkitkan** mereka dengan
skill, seperti Resurrection Signet, yang bisa diambil siapa saja. Sebagian mode
menghidupkan kembali yang mati secara bergelombang, atau dengan sendirinya; lihat [Mode](modes.md).

Selama kamu mati, sebuah baris di bawah papan skor menghitung mundur
sampai kamu kembali, atau memintamu menunggu dibangkitkan. Jendela tim
menampilkan hitungan itu di samping setiap sekutu yang mati.

Setiap kematian membuatmu kehilangan 15% **moral**, sampai -60%: Darah maksimum
dan Energi-mu menyusut bersamanya. Setiap musuh yang dibunuh timmu memulihkan 2%,
sampai 0. Di Perang Guild, menguasai tiang bendera menaikkannya melebihi itu,
sampai +10%.
`;export{e as default};
//# sourceMappingURL=combat-basics-BoaWaCMt.js.map