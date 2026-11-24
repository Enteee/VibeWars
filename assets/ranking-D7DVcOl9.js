var e=`# Peringkat

## Apa yang diperingkatkan

Setiap pertandingan dari antrean tanpa bot adalah pertandingan
peringkat: Arena Acak dan Arena Tim. Game Host, Area latihan, dan
pertandingan apa pun yang ada botnya tidak diperingkatkan. Tidak ada
sakelar untuk itu dan tidak ada antrean terpisah. Pertandingan
peringkat tidak pernah mengisi kursi kosong dengan bot.

## Ratingmu

Ratingmu milik kunci pemainmu, yang disimpan browser ini. Setiap
karakter yang kamu mainkan di sini memakai rating yang sama.

Antrean peringkat memasangkan pemain dengan rating serupa, dan
membaginya ke dalam tim dengan rata-rata rating serupa. Pencarian
dimulai dalam jarak 100 poin dari ratingmu dan melebar 10 poin untuk
setiap detik kamu menunggu, hingga 600, jadi tak ada yang menunggu
selamanya. Selama menunggu, antrean menampilkan ratingmu.

10 pertandingan berating pertamamu bersifat sementara: antrean
menampilkan **Sementara (3/10 pertandingan)** dan kamu belum punya
peringkat. Setelah itu menu utama menampilkan peringkatmu. Rating
meluruh: setiap hari tanpa pertandingan berating membuat ratingmu
kurang pasti, dan papan peringkat mengurutkan menurut nilai yang
hati-hati, jadi jika kamu berhenti bermain, peringkatmu turun dalam
hitungan minggu.

Begitu papan peringkat punya 20 pemain mapan, pertandingan peringkat
hanya dihitung jika setidaknya satu pemain di dalamnya sudah mapan (10
pertandingan berating atau lebih): pertandingan antara pemain baru saja
tidak berating. Bermainlah melawan pemain mapan dan pertandinganmu
dihitung.

Tombol **Papan peringkat** di bilah atas menampilkan 100 teratas
menurut peringkat, nama, dan rating, dengan barismu disorot.

Peringkat pahlawan (★) bukan rating ini: ia berasal dari ketenaran,
lihat [Pendakian Pahlawan](modes.md#pendakian-pahlawan).

## Memulai pertandingan

Saat pertandingan peringkat ditemukan, semua orang mengonfirmasinya
dalam 15 detik, dan layar menampilkan **Mengonfirmasi pertandingan
peringkat…**. Jika ada yang tidak mengonfirmasi, pertandingan
dibatalkan dan semua kembali ke antrean.

## Mengakhiri pertandingan

Di akhir, semua orang menandatangani hasilnya dalam 30 detik. Tidak
menandatangani dihitung sebagai keluar, dan keluar dari pertandingan
peringkat dihitung kalah, termasuk bagi host. Tombol keluar
mengatakannya. Hasil hanya dihitung jika lebih dari separuh kursi
menandatanganinya.

## Apa yang dipublikasikan

Tanda terima pertandingan dikirim ke relay Nostr publik. Isinya kunci
publik dan nama karakter setiap pemain (pemain tanpa karakter dicatat
sebagai starter), serta siapa melawan siapa. Siapa pun bisa
membacanya, dan tidak bisa ditarik kembali. Pertandingan tanpa
peringkat tidak mempublikasikan apa pun.

## Kapan diperbarui

Ratingmu berubah dalam satu jam, dan papan peringkat ikut berubah.
`;export{e as default};
//# sourceMappingURL=ranking-D7DVcOl9.js.map