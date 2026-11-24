var e=`# Ranking

## Co jest rankingowe

Każdy mecz z kolejki bez botów jest rankingowy: Arena losowa i Arena
drużynowa. Gra prywatna, Poligon i każdy mecz z botem są nierankingowe.
Nie ma na to przełącznika ani osobnej kolejki. Mecz rankingowy nigdy
nie wypełnia wolnego miejsca botem.

## Twój ranking

Twój ranking należy do twojego klucza gracza, tego, który przechowuje
ta przeglądarka. Wszystkie postacie, którymi na nim grasz, mają jeden
wspólny ranking.

Kolejki rankingowe łączą graczy o podobnym rankingu i dzielą ich na
drużyny o podobnym średnim rankingu. Wyszukiwanie zaczyna się w
zakresie 100 punktów od twojego rankingu i poszerza się o 10 punktów
za każdą sekundę czekania, do 600, więc nikt nie czeka w nieskończoność.
Podczas czekania kolejka pokazuje twój ranking.

Twoje pierwsze 10 meczów z oceną jest tymczasowych: kolejka mówi
**Tymczasowy (3/10 meczów)** i nie masz jeszcze miejsca. Potem menu
główne pokazuje twoje miejsce. Ranking się starzeje: każdy dzień bez
meczu z oceną czyni twój mniej pewnym, a tabela wyników sortuje według
ostrożnej wartości, więc jeśli przestaniesz grać, twoje miejsce spadnie
w ciągu tygodni.

Gdy w tabeli jest 20 ustabilizowanych graczy, mecz rankingowy liczy się
tylko wtedy, gdy co najmniej jeden gracz w nim jest ustabilizowany (10
lub więcej meczów z oceną): mecz wyłącznie między nowymi graczami nie
jest oceniany. Zagraj z kimś ustabilizowanym, a twoje mecze się liczą.

Przycisk **Tabela wyników** na górnym pasku pokazuje 100 najlepszych
według miejsca, nazwy i rankingu, z wyróżnionym twoim wierszem.

Ranga bohatera (★) to nie ten ranking: pochodzi ze sławy, zobacz
[Szczyt Bohaterów](modes.md#szczyt-bohaterów).

## Początek meczu

Gdy mecz rankingowy zostanie znaleziony, wszyscy potwierdzają go w
ciągu 15 sekund, a ekran pokazuje **Potwierdzanie meczu rankingowego…**.
Jeśli ktoś tego nie zrobi, mecz jest anulowany i wszyscy wracają do
kolejki.

## Koniec meczu

Na koniec wszyscy podpisują wynik w ciągu 30 sekund. Niepodpisanie
liczy się jak wyjście, a wyjście z meczu rankingowego liczy się jako
porażka, także dla gospodarza. Mówi o tym przycisk wyjścia. Wynik się
liczy tylko wtedy, gdy podpisało go więcej niż połowa miejsc.

## Co jest publikowane

Pokwitowanie meczu trafia na publiczne przekaźniki Nostr. Zawiera klucz
publiczny i imię postaci każdego gracza (gracz bez postaci figuruje jako
starter) oraz kto z kim grał. Każdy może je przeczytać i nie można go
cofnąć. Mecze nierankingowe niczego nie publikują.

## Kiedy się aktualizuje

Twój ranking zmienia się w ciągu godziny, a razem z nim tabela wyników.
`;export{e as default};
//# sourceMappingURL=ranking-BjNEieNm.js.map