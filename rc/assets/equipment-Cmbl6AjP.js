var e=`# Perlengkapan

Bagian **Peralatan** di editor build berisi senjata dan armor-mu.
Seret senjata dan tangan kedua dari perpustakaan di kanan, atau klik salah satunya untuk
memasangnya. Armor dipilih pada figur, di bawah.

## Set senjata

Kamu membawa sampai **empat set senjata**, masing-masing berisi satu senjata dan, kalau senjata itu
menyisakan satu tangan bebas, tangan kedua seperti perisai atau focus. Set 1 adalah
set yang kamu pakai di awal; yang lain boleh dibiarkan kosong.

Dalam laga, ganti set dengan **1 sampai 4** (**F1 sampai F4** di tombol Klasik).
Pergantian menunggu rapalan atau ayunan yang sedang berjalan selesai; bergerak atau Esc
langsung mengganti. Tidak ada cooldown. Seranganmu, skill yang butuh
senjata tertentu, dan Energi maksimummu semuanya mengikuti set yang sedang dipegang.

Sebuah senjata butuh peringkat 9 di atributnya: di bawah itu, pukulannya hanya sepertiga
damage-nya, dan editor menyatakannya dengan warna merah. Pedang selalu
Swordsmanship, tapi staff, wand, perisai atau focus dibuat untuk
atribut pilihanmu: klik tangannya pada figur (**6** untuk senjata,
**7** untuk tangan kedua) lalu pilih satu.

## Mod senjata

Setiap senjata dan tangan kedua punya slot untuk mod: **prefiks**, **sufiks**
dan **inskripsi**. Klik tangan pada figur, atau barisnya di
sampingnya, untuk memilihnya; masing-masing menjelaskan efeknya. Wand, perisai
dan focus tidak menerima prefiks; tangan kosong tidak menerima apa pun. Mod selalu bernilai
terbaik, dan setiap set senjata memakai mod-nya sendiri, jadi mengganti set juga mengganti
mod-nya: Darah dan Energi maksimum ikut berpindah bersama set yang dipegang.
Mengganti senjata mempertahankan mod yang masih cocok dan memberi tahu mana yang
dibuang.

| Mod                       | Slot      | Cocok untuk                                   | Efek                                   |
| ------------------------- | --------- | --------------------------------------------- | -------------------------------------- |
| Defensive                 | Prefiks   | Staff                                         | Armor +5                               |
| Hale                      | Prefiks   | Staff                                         | +30 Darah                              |
| Insightful                | Prefiks   | Staff                                         | Energi +5                              |
| of Defense                | Sufiks    | senjata martial apa pun, Staff                | Armor +5                               |
| of Fortitude              | Sufiks    | senjata martial apa pun, Staff, Shield, Focus | +30 Darah                              |
| of Shelter                | Sufiks    | senjata martial apa pun, Staff                | Armor +7 (vs. damage fisik)            |
| of Warding                | Sufiks    | senjata martial apa pun, Staff                | Armor +7 (vs. damage elemen)           |
| "Cast Out the Unclean"    | Inskripsi | Shield, Focus                                 | Durasi Disease padamu berkurang 20%    |
| "Fear Cuts Deeper"        | Inskripsi | Shield, Focus                                 | Durasi Bleeding padamu berkurang 20%   |
| "I Can See Clearly Now"   | Inskripsi | Shield, Focus                                 | Durasi Blinded padamu berkurang 20%    |
| "I have the power!"       | Inskripsi | senjata martial apa pun                       | Energi +5                              |
| "Leaf on the Wind"        | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage cold)            |
| "Like a Rolling Stone"    | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage earth)           |
| "Live for Today"          | Inskripsi | Focus                                         | Energi +15, regenerasi Energi -1       |
| "Not the face!"           | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage blunt)           |
| "Only the Strong Survive" | Inskripsi | Shield, Focus                                 | Durasi Weakness padamu berkurang 20%   |
| "Pure of Heart"           | Inskripsi | Shield, Focus                                 | Durasi Poison padamu berkurang 20%     |
| "Riders on the Storm"     | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage lightning)       |
| "Seize the Day"           | Inskripsi | Staff, Wand                                   | Energi +15, regenerasi Energi -1       |
| "Sleep Now in the Fire"   | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage fire)            |
| "Soundness of Mind"       | Inskripsi | Shield, Focus                                 | Durasi Dazed padamu berkurang 20%      |
| "Strength of Body"        | Inskripsi | Shield, Focus                                 | Durasi Deep Wound padamu berkurang 20% |
| "Swift as the Wind"       | Inskripsi | Shield, Focus                                 | Durasi Crippled padamu berkurang 20%   |
| "The Riddle of Steel"     | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage slashing)        |
| "Through Thick and Thin"  | Inskripsi | Shield, Focus                                 | Armor +10 (vs. damage piercing)        |

### Prefiks martial saat kena

| Prefiks                      | Cocok untuk                | Efeknya saat kena                                                     |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------- |
| Vampiric                     | senjata martial apa pun    | mencuri 3 Darah (5 pada hammer, scythe, bow); regen Darah -1          |
| Zealous                      | senjata martial apa pun    | mendapat 1 Energi; regen Energi -1                                    |
| Sundering                    | senjata martial apa pun    | peluang 20% untuk +20% penetrasi armor                                |
| Furious                      | martial, bukan bow         | peluang 10% untuk adrenalin ganda                                     |
| Barbed, Crippling, Poisonous | martial, bukan hammer      | Bleeding, Crippled, Poison yang kamu sebabkan bertahan 33% lebih lama |
| Cruel                        | martial, bukan bow         | Deep Wound yang kamu sebabkan bertahan 33% lebih lama                 |
| Heavy                        | axe, hammer, scythe, spear | Weakness yang kamu sebabkan bertahan 33% lebih lama                   |
| Silencing                    | dagger, spear, bow         | Dazed yang kamu sebabkan bertahan 33% lebih lama                      |
| Ebon, Fiery, Icy, Shocking   | senjata martial apa pun    | damage-nya menjadi earth, fire, cold atau lightning                   |

"Saat kena" berarti pukulan serangan atau skill serangan yang mendarat: yang ditangkis
atau meleset tidak berefek apa pun. Kondisi yang lebih lama adalah kondisi yang disebabkan
skill seranganmu.

### Mod yang bergantung pada keadaanmu

Mod yang bergantung pada keadaanmu hanya berlaku selama keadaan itu bertahan. "Di atas" atau
"di bawah setengah Darah" berlaku secara ketat: tepat di setengah, keduanya tidak berlaku. Saat
maksimum yang dinaikkan berakhir, Darah atau Energi di atas maksimum baru akan hilang.

| Mod                                                | Slot, cocok untuk            | Efeknya                                                                    |
| -------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| "Strength and Honor"                               | inskripsi, martial           | +15% damage senjata di atas setengah Darah                                 |
| "Guided by Fate", "Dance with Death"               | inskripsi, martial           | +15% damage senjata saat diberkahi, saat dalam kuda-kuda                   |
| "Too Much Information"                             | inskripsi, martial           | +15% damage senjata terhadap musuh yang terkutuk                           |
| "Vengeance is Mine"                                | inskripsi, martial           | +20% damage senjata di bawah setengah Darah                                |
| "Don't Fear the Reaper"                            | inskripsi, martial           | +20% damage senjata saat terkutuk                                          |
| "To the Pain!"                                     | inskripsi, martial           | +15% damage senjata; -10 armor saat menyerang                              |
| "Brawn over Brains"                                | inskripsi, martial           | +15% damage senjata; -5 Energi                                             |
| "Hale and Hearty", "Have Faith"                    | inskripsi, senjata apa pun   | +5 Energi di atas setengah Darah, saat diberkahi                           |
| "Don't call it a comeback!", "I am Sorrow."        | inskripsi, senjata apa pun   | +7 Energi di bawah setengah Darah, saat terkutuk                           |
| of Devotion, of Endurance                          | sufiks, staff, shield, focus | +45 Darah saat diberkahi, saat dalam kuda-kuda                             |
| of Valor                                           | sufiks, staff, shield, focus | +60 Darah saat terkutuk                                                    |
| "Luck of the Draw"                                 | inskripsi, shield atau focus | peluang 20% pukulan fisik memberi 5 lebih sedikit                          |
| "Sheltered by Faith", "Run For Your Life!"         | inskripsi, shield atau focus | pukulan fisik memberi 2 lebih sedikit saat diberkahi, saat dalam kuda-kuda |
| "Nothing to Fear"                                  | inskripsi, shield atau focus | pukulan fisik memberi 3 lebih sedikit saat terkutuk                        |
| "Hail to the King", "Faith is My Shield"           | inskripsi, focus             | +5 armor di atas setengah Darah, saat diberkahi                            |
| "Might makes Right", "Knowing is Half the Battle." | inskripsi, focus             | +5 armor saat menyerang, saat merapal mantra                               |
| "Man for All Seasons", "Survival of the Fittest"   | inskripsi, focus             | +5 armor terhadap damage elemen, fisik                                     |
| "Ignorance is Bliss", "Life is Pain"               | inskripsi, focus             | +5 armor; -5 Energi, -20 Darah                                             |
| "Down But Not Out", "Be Just and Fear Not"         | inskripsi, focus             | +10 armor di bawah setengah Darah, saat terkutuk                           |

Damage senjata adalah hasil kocokan senjata itu sendiri: damage bonus skill serangan
tidak ikut dinaikkan.

### Mod perapal

Mod perapal hanya berlaku pada mantra, masing-masing dengan peluangnya sendiri setiap kali kamu
memakai mantra. "Atribut item" adalah atribut yang menjadi dasar pembuatan staff, wand atau focus itu.
Dua mod pemotong setengah yang sama-sama aktif tetap hanya memotong setengah sekali.

| Mod                         | Slot, cocok untuk            | Efeknya                                                       |
| --------------------------- | ---------------------------- | ------------------------------------------------------------- |
| Adept                       | prefiks, staff               | peluang 20% memotong setengah waktu rapal mantra atribut item |
| Swift                       | prefiks, staff               | peluang 10% memotong setengah waktu rapal mantra apa pun      |
| of Aptitude                 | sufiks, focus                | peluang 20% memotong setengah waktu rapal mantra atribut item |
| of Swiftness                | sufiks, focus                | peluang 10% memotong setengah waktu rapal mantra apa pun      |
| "Aptitude not Attitude"     | inskripsi, staff atau wand   | peluang 20% memotong setengah waktu rapal mantra atribut item |
| "Don't think twice"         | inskripsi, staff atau wand   | peluang 10% memotong setengah waktu rapal mantra apa pun      |
| of Memory                   | sufiks, wand                 | peluang 20% memotong setengah cooldown mantra atribut item    |
| of Quickening               | sufiks, wand                 | peluang 10% memotong setengah cooldown mantra apa pun         |
| "Let the Memory Live Again" | inskripsi, staff atau wand   | peluang 10% memotong setengah cooldown mantra apa pun         |
| "Forget Me Not"             | inskripsi, focus             | peluang 20% memotong setengah cooldown mantra atribut item    |
| "Serenity Now"              | inskripsi, focus             | peluang 10% memotong setengah cooldown mantra apa pun         |
| of Mastery                  | sufiks, staff                | peluang 20% atribut item +1 untuk sebuah mantra               |
| "Master of My Domain"       | inskripsi, shield atau focus | peluang 20% atribut item +1 untuk sebuah mantra               |
| of Enchanting               | sufiks, martial atau staff   | berkah yang kamu rapal bertahan 20% lebih lama                |

## Armor

Armor terdiri dari lima bagian: kepala, dada, tangan, kaki dan telapak kaki. Setiap bagian punya
dua slot upgrade:

- **insignia**, sedikit tambahan pada bagian itu: misalnya armor lebih banyak terhadap
  damage fisik, atau saat kamu menyerang;
- **rune**.

**Pelindung kepala**-mu menambah +1 ke satu atribut pilihanmu.

Di editor, armor berupa figur. Klik bagian bernomor di figur itu, atau
barisnya di sampingnya, untuk memilih insignia dan rune-nya; setiap pilihan menjelaskan efeknya
pada bagian itu. **Pasang insignia ke semua 5** memasang insignia yang kamu pilih
di setiap bagian. Figur menampilkan insignia dan rune setiap bagian, dan
memegang senjata dari set yang sedang kamu lihat, beserta mod-nya.

## Rune

| Rune                                   | Yang diberikan                                   |
| -------------------------------------- | ------------------------------------------------ |
| Rune atribut Minor                     | +1 ke sebuah atribut                             |
| Rune atribut Major                     | +2 ke sebuah atribut, -35 Darah                  |
| Rune atribut Superior                  | +3 ke sebuah atribut, -75 Darah                  |
| Vigor                                  | Darah lebih banyak (+30, +41 atau +50)           |
| Vitae                                  | +10 Darah                                        |
| Attunement                             | Energi lebih banyak (+3, +6 atau +9)             |
| Clarity, Purity, Recovery, Restoration | masing-masing dua kondisi hilang 20% lebih cepat |
| Absorption (Warrior)                   | damage fisik dari setiap pukulan lebih kecil     |

Kamu memilih rune sebuah bagian di tempat yang sama dengan insignia-nya: klik bagian itu
pada figur.

Editor menjumlahkan semuanya untukmu: Darah, Energi, armor dan damage, sesuai
yang dimiliki set senjata pertamamu.
`;export{e as default};
//# sourceMappingURL=equipment-Cmbl6AjP.js.map