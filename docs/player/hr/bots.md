# Botovi

**Bot** je igrač kojeg igra igra umjesto tebe. U sobi koju vodiš botovi
igraju svako mjesto koje nitko ne uzme, pa možeš vježbati ili igrati s manje
prijatelja.

## Tko igra bota

Nitko ne dodaje botove: soba navodi samo svoje ljude. Kad
[Timska soba](modes.md#timska-soba) završi, svaka strana igra timski sastav koji je
odabrala, a svakog njegovog lika kojeg nitko nije uzeo igra bot,
pod imenom tog lika. Strana bez ikoga igra nasumični
unaprijed zadani tim, samih botova. Tko napusti Timsku sobu, ostavlja svog
lika botu.

U sobi i Timskoj sobi bot izgleda kao i svi drugi. U
meču je označen s **BOT** na natpisu s imenom, okviru mete, prozoru
grupe i sažetku meča.

Botovi se stvaraju za jedan meč: kad završi, soba opet navodi svoje ljude,
a botovi sljedećeg meča stvaraju se iznova.

## Kako se botovi bore

Bot igra ulogu koju mu daje sastav. Onaj s oružjem za blisku borbu je
**prva linija**: približava se i napada svoju metu. Onaj s dvije ili više
vještina liječenja ili zaštite koje može baciti na saveznika je **iscjelitelj**: stoji
iza saveznika koji je najteže ranjen, podalje od neprijatelja. Kad dva ili više
neprijatelja napadnu istog saveznika, iscjelitelj stavlja svoju zaštitu na njega prije
nego što udarac padne. Svaki drugi bot je **dalekometni**: drži se tamo gdje dosežu svi
njegovi napadi te staje i bori se s neprijateljem koji mu priđe preblizu. Dalekometni
botovi i iscjelitelji pomiču se onamo gdje ih može dohvatiti manje neprijatelja i koriste stupove
kao zaklon. Tim se okreće na svakog neprijatelja u dosegu koji padne ispod 60% zdravlja,
da ga dokrajči. U Kralju brda, dok tvoj tim ne drži oltar,
Sablasni heroj drugog tima na oltaru dolazi čak i prije toga.
Bot koji jako odmakne od tima čeka ostale prije nego što krene
dalje.

Kad nijedan neprijatelj nije blizu, bot povuče polugu koja otvara kraći put do neprijatelja.

Botovi koji nanose štetu čuvaju velike udarce, vještine napada i čarolije štete,
i ispaljuju ih zajedno na metu tima, tako da šteta padne odjednom
umjesto da kaplje i iscjelitelj je poništi: najsporija čarolija ide
prva, brža onoliko kasnije koliko je brža. U međuvremenu nastavljaju
zamahivati i bacati uroke i stanja. Bot čeka suigrače najviše četiri
sekunde, a uopće ne čeka da dokrajči neprijatelja ispod
30% zdravlja. Kad je meta pod zaštitnim začaranjem poput
Protective Spirit ili Aegis, bot s uklanjanjem začaranja, poput Strip
Enchantment, najprije ga skine, a ostali zadržavaju udarce dok to ne učini.

Teško ranjen bot koji gubi borbu povlači se iza svog iscjelitelja ili
u svoju bazu te se odmara izvan dosega dok ne povrati većinu zdravlja.

Bot uskrsava palog saveznika samo kad neprijatelji nisu odmah iznad
tijela, kad je blizu više njegovih nego njihovih, i nikad
dok neprijatelj u blizini cilja samog bota.

Botovi se izmiču otprilike polovici projektila usmjerenih na njih, poput
Fireball ili strijele vještine napada, pa zaustavljanje ili okret djeluju
na njih kao i na tebe.

Botovi zaobilaze zapaljeno tlo i druga štetna mjesta kad zaobilazak nije
puno duži, i izlaze iz onog u kojem stoje.

Bot s prekidom čuva ga za bacanja koja su važna: najprije
uskrsnuće ili Sablasnog heroja koji zauzima oltar, zatim liječenje ili
zaštitu, elitnu vještinu ili velik
udarac poput vještine napada ili čarolije štete. Sve ostalo,
i običan udarac oružjem, pušta. Poput igrača, promaši otprilike jedno
od četiri takva bacanja.

Botu treba ljudski trenutak, djelić sekunde, da reagira na
ono što se događa, pa ga brz prekid ili kasni izmak mogu nadmudriti.

U borbi tri tima botovi se bore protiv jednog neprijateljskog tima
odjednom: tima koji ih napada ili, dok ih nitko ne napada, najranjenijeg tima
u dosegu. Ostaju na tom timu dok drugi ne usmjeri znatno više
igrača na njih, i ne jure na svjež tim dok ih drugi
napada. Meta koju je označio njihov tim dolazi prva, u kojem god timu
bila. Računaju se samo igrači: sablast ili stražari nekog tima u blizini
ne okreću botove na taj tim.

## Nasumična arena

Nasumična arena nema botova: svako mjesto zauzima pravi igrač, a čekaš
dok ih dovoljno ne uđe u red.
