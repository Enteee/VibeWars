var e=`# Modos

Cada mapa joga um modo. Os
modos são as entradas da barra à esquerda da tela principal. Ninguém
escolhe o modo de um mapa, mas a entrada da barra de onde você hospeda
escolhe os modos que os mapas da sala jogam: ![Arena de Equipes](../../../apps/web/public/icons/mode/team-arena.svg) **Arena de Equipes**
Aniquilação, Contagem de Abates e Aniquilação de Sacerdotes, ![Ascensão dos Heróis](../../../apps/web/public/icons/mode/heroes-ascent.svg) **Ascensão
dos Heróis** Corrida da Relíquia, Rei da Colina e Captura de Pontos, e
![GvG](../../../apps/web/public/icons/mode/gvg.svg) **GvG** a Batalha de Guildas. ![Partida Hospedada](../../../apps/web/public/icons/mode/hosted-game.svg) **Partida Hospedada** oferece todos os
mapas. Uma ![Arena Aleatória](../../../apps/web/public/icons/mode/random-arena.svg) **Arena Aleatória** escolhe um mapa para você e, com ele, o
modo, mas nunca uma Batalha de Guildas, uma Corrida da Relíquia, Rei da
Colina ou Captura de Pontos. A Arena de Equipes sorteia um dos seus mapas
a cada partida, a Ascensão dos Heróis começa no primeiro mapa dela, e só
uma Partida Hospedada deixa o host escolher. A tela de nenhum outro modo
diz qual mapa vem a seguir: a partida o mostra enquanto carrega.

Dois jogadores atrás de redes restritas não podem ser pareados entre si numa fila, então a fila conta só os jogadores que podem ser pareados com você, e diz isso. Um relay em **Opções → relay (TURN)** ajuda.

Todo mapa é feito para alguns tamanhos de equipe, e um modo só joga um
mapa feito para o seu tamanho: um 8v8 nunca se espreme em uma arena feita
para 1v1. O **Tamanho** da barra só passa pelos tamanhos que o modo
mostrado joga.

| Modo                | Tamanhos      | Mapa                                          |
| ------------------- | ------------- | --------------------------------------------- |
| Arena Aleatória     | 1v1, 2v2, 4v4 | sorteado para você, feito para o tamanho      |
| Arena de Equipes    | 2v2, 4v4, 8v8 | sorteado a cada partida, feito para o tamanho |
| Ascensão dos Heróis | 8v8           | seus mapas em ordem, até o Hall               |
| GvG                 | 8v8           | Guild Hall Isle                               |
| Partida Hospedada   | qualquer      | o host escolhe um feito para o tamanho        |

Em uma Batalha de Guildas, uma Corrida da Relíquia, Rei da Colina ou
Captura de Pontos, um objetivo fora da tela ou sob a interface ganha uma
seta contornada na borda da tela: o suporte ou um santuário na cor do
dono, cinza se não for de ninguém, e o altar em dourado. A seta preenchida
de um jogador é desenhada por cima.

Uma partida abre com cada equipe retida junta na sua área inicial: você pode andar por qualquer lugar dentro dela e se preparar com habilidades em você e nos seus aliados, como encantamentos, posturas e curas, mas não pode atacar nem usar uma habilidade em um inimigo. Energia e vida se regeneram enquanto você espera, e os bots também se preparam. Uma parede cintilante em volta da área inicial da sua equipe mostra até onde você pode ir. Uma linha no topo conta os jogadores que carregaram a partida. Quando todos carregam, ela conta 10 segundos e a partida começa, e o seu relógio com ela. Um jogador que não carregou após 20 segundos não é esperado: a contagem começa sem ele, e ele ainda pode entrar depois.

## Aniquilação

**Derrote todos os inimigos.** Os mortos ficam caídos até um aliado os
ressuscitar, e cada morte custa moral. Elimine a outra equipe para vencer.
Depois de 8 minutos, vence a equipe com mais moral restante.

Canyon, Crossroads e Long Hall jogam esse modo, além de duas arenas
pequenas, mais ou menos do tamanho de Canyon: **Sandstone Steps** (1v1,
2600x1940), uma cidade de deserto em terraços com um pátio de poço
rebaixado, telhados acima das ruas e, abaixo delas, uma passagem
subterrânea aberta por alavanca; e **Frozen Crossing** (2v2, 2600x1940),
um rio congelado entre duas margens elevadas, atravessado por pedras de
passagem ou por uma ponte de troncos cuja tábua do meio é erguida por
uma alavanca. Para equipes maiores: **Ashen Courtyard** (4v4,
5120x3840), um pátio murado queimado, com adarves e torres em cima e um
pátio de poço rebaixado embaixo, e a grade levadiça do portão é acionada
das muralhas; e **Moss Vale** (8v8, 5000x2600), um vale em terraços
cortado ao meio por um canal de moinho profundo, atravessado só na ponte
levadiça, no moinho e na passagem por baixo dele.
**Canthan Terraces** (1v1, 2400x2100) é pequena, mas íngreme: arrozais
subindo uma encosta até um pagode em ruínas, com um bueiro alagado por
baixo que uma alavanca de comporta abre como terceiro caminho até o
centro. **Sunken Bastion** (2v2,
2700x1900) é pequena, mas alta: uma fortaleza meio alagada cujo fosso
divide o pátio; dá para atravessá-lo por uma ponte levadiça acionada por
uma alavanca em cada margem, pelo adarve ao longo da muralha norte ou
pelo porão alagado logo abaixo.
E para equipes maiores: **Shiverpeak Pass** (4v4, 5100x3450), uma
passagem de montanha nevada cortada por um abismo, que se atravessa por uma
ponte de corda entre duas saliências do penhasco, puxada por uma alavanca
em cada saliência, por uma caverna embaixo dele ou contornando sua ponta
depois que a parede de gelo dali é quebrada;
e **Elonian Plateau** (8v8, 5520x3360), um planalto
desértico com quatro mesas em volta do leito seco de um cânion: elevadores
temporizados sobem a três delas, um arco natural liga as duas do norte e uma
passagem corre sob a crista central, com um portão aberto por uma alavanca
lá em cima.

## Contagem de Abates

**Mais abates em 3 minutos.** Os mortos voltam no ponto de início depois
de 8 segundos, e morrer não custa moral. A primeira equipe a chegar a 15
abates vence na hora. No fim do tempo, vence quem tem mais abates; abates
iguais é empate.

Ember Pits joga esse modo: córregos de lava cruzados por pontes de pedra,
um túnel de lava, um elevador de alavanca até uma coluna de basalto e
respiradouros de vapor, para todos os tamanhos de equipe.

## Aniquilação de Sacerdotes

**Derrote todos os inimigos e o sacerdote deles.** Cada equipe tem um
Sacerdote em um santuário atrás do ponto de início. Ele nunca anda nem
ataca, mas cura todos ao lado dele, inimigos também. A cada 2 minutos,
uma equipe com o sacerdote vivo recebe seus mortos de volta no santuário,
com vida e energia cheias. Mate o sacerdote primeiro e a outra equipe
fica caída.

Uma equipe perde quando todos os jogadores e o sacerdote dela estão
mortos. Depois de 12 minutos, vence quem tiver mais moral.

Jungle Ruins (de 2v2 a 8v8, 5400x2800) joga esse modo: ruínas de templo
tomadas pela vegetação, cortadas por um rio da selva. Atravesse um vau,
cruze uma ponte de troncos, suba a pirâmide em degraus no meio ou pegue
a passagem escondida embaixo dela quando uma alavanca num pátio abrir
suas portas; os muros de cipó podem ser derrubados.

## Batalha de Guildas

**Mate o Lorde da Guilda inimigo**, 8 contra 8. Cada base fica atrás de
um muro com dois portões; o Lorde da Guilda fica no fundo da sala dele e
atira com arco em qualquer inimigo que veja. Guardas defendem cada base:
Knights e um Bodyguard junto ao lorde, um Archer no fundo da sala do
lorde, um Footman e um Archer em cada portão. Eles lutam contra inimigos
perto do posto e voltam para ele. Enquanto o Bodyguard vive, seu lorde
recebe 20% menos dano, então mate-o primeiro. A cada 2 minutos, o
santuário de cada equipe traz seus mortos de volta.

Cada equipe tem uma **bandeira** na base, e o **Suporte da Bandeira** fica
no centro. Mire na sua bandeira e pressione **Space** para pegá-la; leve
até o suporte, mire no suporte e pressione **Space** para fincá-la. Quem
carrega anda mais devagar e não pode atacar nem usar habilidades de
ataque; larga a bandeira ao morrer, trocar de armas ou pressionar
**Largar bandeira** acima da barra de vida.
Fincar a sua no suporte manda para casa a bandeira inimiga que estiver lá.
A cada 2 minutos em que sua bandeira fica no suporte, sua equipe ganha 10%
de moral.

A equipe cujo Lorde da Guilda morre perde na hora, e também uma equipe
com todos os jogadores mortos na moral mínima. Depois de 28 minutos,
vence a equipe que causou mais dano ao Lorde da Guilda inimigo; um empate
aí é derrota para as duas, pois não há empates.

O placar mostra a vida de cada Lorde da Guilda, o seu primeiro, quem
controla o suporte e quanto falta para o bônus, quando os santuários
trazem os mortos de volta e, nos últimos 3 minutos, o dano de cada equipe
ao lorde inimigo. Embaixo, uma linha diz quem está carregando uma
bandeira. Um bônus aparece como "Bônus de moral! +10%" ou "Bônus de moral
inimigo". Na bússola, ♛ marca cada Lorde da Guilda, ⚑ cada bandeira e ◎ o
suporte.

Guild Hall Isle (8v8, 6000x2600) joga esse modo: uma ilha no mar. Cada Guild Lord fica no topo de um salão, atrás de uma muralha; sai-se pela guarita, por cima da muralha ou ao longo de um cais. A porta da guarita abre com uma alavanca na muralha inimiga. O suporte da bandeira fica num estrado no centro.

## Corrida da Relíquia

**Leve sua relíquia ao altar.** Cada equipe tem uma **relíquia** na base,
e o **altar** fica no centro, o mesmo percurso das duas bases, por uma
rota ao norte ou ao sul; o altar aparece na bússola como ◆.
Mire na sua relíquia e pressione **Space** para pegá-la. Leve até o altar
e você marca um ponto na hora, e a relíquia volta à sua base. Todo ponto é
anunciado, com uma fanfarra que sobe para os seus e desce para os deles.
Quem carrega anda mais devagar e não pode atacar nem usar habilidades de
ataque. Atravessa a própria equipe, mas um inimigo ainda o bloqueia. Larga
a relíquia ao morrer ou ao pressionar **Largar relíquia** acima da barra
de vida, e ela fica onde caiu até alguém chegar. Sua equipe a pega dali.
Um inimigo que chegar nela, de mãos vazias, a manda para casa. A relíquia
de um inimigo na base dele não é sua para tocar.

Os mortos ficam caídos até um aliado os ressuscitar, e cada morte custa
moral. Elimine a outra equipe para vencer na hora. Depois de 8 minutos,
vence a equipe com mais pontos; pontos iguais é empate. Abates não marcam
nada.

O placar mostra os pontos, os seus primeiro, e o relógio. Embaixo, uma
linha para cada relíquia diz onde ela está: \`✦ Name\` em quem carrega,
\`✦ largada\` no chão ou \`✦ na base\`.

Os bots também levam a relíquia: o mais próximo da sua relíquia vai
buscá-la, a menos que você esteja prestes a pegá-la. Um bot fora da luta
vai primeiro; quando todos estão lutando, o mais próximo sai para buscar a
relíquia, para que um impasse no altar nunca pare a pontuação. Um
curandeiro ou um bot muito ferido só vai quando ninguém mais pode, e nunca
saindo de uma luta. O mais próximo de uma relíquia inimiga largada a manda
para casa, e os outros esperam junto ao altar. Um bot carregando sua
relíquia vai direto ao altar; os outros só largam a relíquia para lutar
contra um inimigo que chegue ao alcance de feitiço.

Broken Tower joga esse modo (4v4 e 8v8, 5400x2800): uma torre caída numa colina das terras altas. Suba pelas escadas dos terraços de entulho até o altar no toco da torre, ou vá pelo porão sob a colina assim que uma alavanca no terraço abrir as portas; as paredes de entulho podem ser quebradas.

### Cinder Sanctum

Aqui a Corrida da Relíquia da Ascensão dos Heróis é jogada ao contrário. Cada base tem a relíquia da sua equipe e o seu Herói Fantasmagórico, e não há altar. **Pegue a relíquia inimiga na base dela e leve-a ao seu próprio Herói Fantasmagórico** para marcar um ponto. O fantasma precisa estar vivo e fica no seu posto. Você não pode carregar a própria relíquia: pegá-la onde caiu a manda de volta para casa. Uma equipe com **3 pontos de vantagem vence na hora**. Aos 8 minutos vence quem tiver mais pontos, e um empate fica com a última equipe a marcar. Cada base revive seus mortos, e seu fantasma, a cada 2 minutos. Os bots vão juntos atrás da relíquia inimiga e a trazem para casa.

Cinder Sanctum (8v8, 5600x2800) o joga: um templo na encosta de um vulcão entre dois rios de lava. Atravesse por uma ponte ou pela calçada até o santuário em seu adro; uma alavanca no adro abre a passagem oculta sob o santuário, e os muros de cinza podem ser quebrados. A lava queima.

## Rei da Colina

**Leve seu Herói Fantasmagórico até o altar e controle-o.** Cada equipe
tem um **Herói Fantasmagórico** na base, um fantasma que luta com um
machado e que ninguém joga. O **altar** fica no centro, a mesma caminhada
das duas bases. Em **Threefold Keep**, três equipes (duas se não houver uma terceira livre) o
disputam na torre de uma fortaleza murada. No máximo 12 pontos por
equipe, e se todos os rivais estiverem a -60% de moral, você vence na hora. O **Hall of
Heroes** (8v8, 5000x4400), o mapa que encerra a Ascensão dos Heróis, é um
salão dourado para três equipes: o altar fica sobre um estrado com pilares e
seis escadarias, num pedestal com uma galeria entre cada par de bases, e uma
cripta corre sob o piso de cada base até dentro do pedestal. As portas das
criptas começam fechadas, e a alavanca de qualquer equipe abre as três. Mire no seu fantasma com o **botão direito** e
pressione **Space** para mandá-lo seguir você: ele anda com você e luta
contra o que você luta. Pressione Space nele de novo e ele fica onde está,
lutando contra qualquer inimigo que chegue perto. Se você morrer ou sair,
ele fica. Com seu fantasma como alvo, o quadro diz quem ele segue, ou que
ele fica. Um aviso diz quem seu Herói Fantasmagórico segue sempre que isso
muda, e o nome sobre a cabeça dele mostra seu líder.

Seu fantasma tem 640 de vida e golpeia com o machado usando **Cyclone
Axe**, **Disrupting Chop** e **Swift Chop**, seguindo ou parado. Ele fica
mais forte quanto mais alto você estiver na Ascensão: nível 24 em Threefold
Keep, 28 no Hall of Heroes. **Mate o fantasma da outra equipe** e
todo membro da sua equipe ganha um **bônus de moral de +10%**, que primeiro
apaga a penalidade de morte e nunca passa de +10%. Mate-o de novo depois
que ele levantar e você ganha de novo.

Leve-o até o altar ou além e ele sobe no altar e fica nele. Ali ele luta
contra qualquer inimigo ao lado, mas nunca sai para ir atrás de um. Um
fantasma no altar toma o altar sozinho: 5 segundos parado, com a barra de
conjuração enchendo, sem lutar com ninguém. Uma interrupção ou uma
derrubada corta a tomada, e ele recomeça assim que puder. Ele só pode
tomar o altar enquanto ninguém o controla ou enquanto o fantasma de quem
controla está morto. Quando a tomada termina, o altar é da sua equipe.

A equipe que controla o altar marca um ponto a cada 30 segundos que o
mantém, mesmo com o próprio fantasma morto, até outra equipe tomá-lo.
Todo ponto é anunciado, como uma relíquia entregue. Um fantasma morto
levanta na base 2 minutos depois, parado, aqui e em uma Corrida da
Relíquia. Em Captura de Pontos, ele levanta com a próxima onda da base. Em
um mapa com sacerdotes, ele levanta com a próxima onda do sacerdote, mas
só enquanto o sacerdote da equipe viver. Em qualquer outro mapa, um
fantasma morto continua morto, e seu +10% só pode ser ganho uma vez. Ele
não é um jogador: sua morte não custa moral e não conta para uma
eliminação.

Os mortos ficam caídos até um aliado os ressuscitar, e cada morte custa
moral. Elimine a outra equipe para vencer na hora. Depois de 8 minutos,
vence a equipe com mais pontos; pontos iguais é empate. Abates não marcam
nada.

O placar mostra os pontos, os seus primeiro, depois o altar: \`▲\` e o tempo
até o próximo ponto de quem controla, na cor dele, ou um \`▲ —\` cinza
enquanto ninguém controla.

Os bots também vão atrás do altar: enquanto sua equipe não o controla, o
mais próximo do seu Herói Fantasmagórico vai buscá-lo, a menos que você esteja
prestes a fazer isso; um curandeiro ou um bot muito ferido só vai quando
ninguém mais pode. Ele leva o fantasma até o altar e o manda ficar ali, e
os outros esperam junto ao altar. Um bot levando o fantasma não para para
lutar no caminho; os outros só saem do altar para lutar contra um inimigo
que chegue ao alcance de feitiço. Enquanto sua equipe não controla o
altar, todo bot mata primeiro o Herói Fantasmagórico da outra equipe assim
que ele estiver no altar ao alcance deles: é o único inimigo que impede
seu fantasma de tomá-lo.

Threefold Keep joga esse modo (4v4 e 8v8, 5000x4400): uma fortaleza numa colina das terras altas, para três equipes. Suba ao adarve pela escada ao lado do seu portão e atravesse uma calçada até a colina, depois suba até o altar na torre. Uma alavanca em cada pátio abre os quatro portões: a passagem do seu portão sob a muralha, e a cripta, o caminho longo sob a colina.

## Captura de Pontos

**Controle os santuários.** O mapa tem cinco **santuários**: um junto a
cada base e três entre elas, o do centro a céu aberto. Fique sobre um
santuário para capturá-lo. Cada membro da sua equipe nele é um **pip**,
seu Herói Fantasmagórico vale quatro; mascotes, lacaios e espíritos não
contam. Com quatro pips, um santuário neutro é seu em 8 segundos, com dois
em 16, sozinho em 32; mais de quatro não aceleram. Inimigos nele cancelam
seus pips um a um: três dos seus contra dois deles capturam com um pip, em
32 segundos, oito contra dois com quatro, e pips iguais mantêm tudo
parado. Com três equipes, a mais forte avança com seus pips menos os das
outras duas somados; se as outras duas tiverem mais, ninguém captura, e um
santuário que tenha dono só é drenado até neutro. Um santuário de outra
equipe primeiro é drenado até neutro e depois preenchido para você, então
tomá-lo leva o dobro do tempo. Saia e o progresso fica onde estava; um
santuário seu continua seu até um inimigo tomá-lo. Os santuários aparecem
na bússola como □ na cor do dono.

A cada 30 segundos, cada santuário da sua equipe marca um ponto, e um
aviso e um som anunciam quanto cada lado marcou. A cada 60 segundos do relógio da partida, os mortos da sua equipe levantam no santuário da sua base com vida e energia cheias, mesmo com um inimigo ali, a menos que a moral deles esteja no piso. O placar faz a contagem até a próxima onda. Cada morte custa moral, e um fantasma levanta na mesma onda, no seu próprio lugar.
Fique **20 pontos à frente** de todas as outras equipes para vencer na hora. Eliminar uma equipe não encerra a partida, mas uma equipe cujos jogadores saíram todos está fora. Depois de 8 minutos, vence a equipe com
mais pontos; em pontos iguais, a que controla mais santuários, depois a
equipe que ficou por último à frente sozinha e, se nenhuma ficou, é
empate. Abates não marcam nada.

Cada santuário é um anel no chão na cor do dono, cinza enquanto não é de
ninguém, com um arco em volta que mostra o quanto falta para quem o está
tomando. O placar mostra os pontos, os seus primeiro, e o relógio.

Os bots se espalham pelos santuários que sua equipe ainda não tem e ficam
sobre eles até serem tomados. Um inimigo ao alcance de feitiço não os
afasta: eles vão para um santuário ao alcance e lutam dali.

Scarred Earth (4v4 e 8v8, 5400x2800) joga esse modo: um campo de batalha cheio de crateras ao entardecer. Os santuários ficam sobre torres de cerco destruídas, o do centro na plataforma da grande torre, cada um ao lado de uma cratera; alavancas nas torres abrem duas trincheiras sob o campo, e as paliçadas destruídas podem ser quebradas.

Na Ascensão dos Heróis, The Warden's Gallery (8v8, 5200x2500) joga esse modo: uma galeria de esculturas ensolarada sob claraboias. O santuário do centro fica no topo do grande pedestal, e cada equipe tem três perto do seu vestíbulo, um sobre um pedestal; alavancas no grande pedestal abrem duas criptas sob o piso, e as estátuas tombadas podem ser quebradas.

## Sala de Equipe

Uma sala hospedada não começa a partida quando todos estão prontos. Ela abre primeiro a Sala de Equipe, onde cada lado escolhe uma Build
de Equipe junto e depois divide os personagens. Em Ascensão dos Heróis e
GvG, um lado é do tamanho da equipe do modo (8), que o **Tamanho** da
barra lateral mostra, travado. Em Arena de Equipes, o líder do grupo
escolhe 2v2, 4v4 ou 8v8 com as setas enquanto o grupo não está na fila, e
o resto do grupo vê travado. Começa no último tamanho que o líder escolheu
em Arena de Equipes, 4v4 no início. Um grupo nunca escolhe um tamanho
menor que seus jogadores, e um grupo com tantos jogadores quanto o tamanho
não aceita mais ninguém ("O grupo está cheio."). Dois grupos só se
encontram no mesmo tamanho, e a janela do ícone de fila na barra superior
o mostra: "Arena de Equipes 2v2". Em uma Partida Hospedada, o host define
o tamanho com as setas, de 1v1 a 8v8, antes da Sala de Equipe, e os dois
lados jogam exatamente esse número; a Sala de Equipe não mostra Tamanho.
Um convidado vê o do host, travado. A lista de mapas do host mostra só
mapas feitos para esse tamanho, e um tamanho que não serve ao mapa move a
sala para o primeiro mapa que sirva. Ele nunca fica abaixo dos jogadores
de um lado, e um lado com tantos jogadores quanto o tamanho da equipe não
aceita mais ninguém. Um 1v1 lista todos os seus personagens, com os
membros de equipe marcados com sua equipe: clique em um para jogar com
ele, ou espere e jogue com seu personagem ativo.
**Sair** da sua equipe tira você dela sem sair da sala.
Um grupo na fila ([Buscar partida](getting-started.md#hospedar-ou-entrar-em-uma-partida)
em Arena de Equipes, Ascensão dos Heróis ou GvG) recebe uma Sala de Equipe
só do próprio lado, do tamanho da equipe do modo (o tamanho escolhido na
Arena de Equipes, 8 nos outros), não importa quantos estejam no grupo; os
bots jogam nos assentos que ninguém pegar.
Enquanto está na fila, você pode ver os outros modos: o grupo mantém o
modo e o tamanho até sair da fila.
Cada etapa dura 30 segundos e termina antes quando todos na Sala de
Equipe estiverem prontos. Votar e pegar um assento marcam você como pronto.

![Arena de Equipes: as setas de tamanho da equipe no pé da barra e a equipe da sua sala para entrar](../img/team-arena-1.png)

![Depois de entrar: você está na sua equipe como anfitrião, ainda não pronto](../img/team-arena-2.png)

**Votação.** Qualquer pessoa de um lado pode propor uma Build de Equipe
exatamente do tamanho desse lado, uma proposta cada. Suas Builds de
Equipe abrem pela aba **Suas Builds de Equipe** à direita: busque pelo
nome, clique em uma para ver os membros e depois em **Propor esta build**;
na sua, **Retirar proposta**. Esc fecha. Só aparecem suas Builds de Equipe
desse tamanho e sem problemas; a gaveta diz quantas de outros tamanhos
ficaram de fora. Qualquer pessoa pode votar em uma das propostas do seu
lado, inclusive a própria. Cada proposta é um cartão que mostra cada
membro segurando as armas, com as habilidades e as iniciais de quem votou
nela: clique em um cartão para votar, ou em outro para mudar seu
voto; não é possível retirá-lo. Ninguém propõe nada em seu lugar: o menu só cria e edita Builds de Equipe.
Uma proposta nova substitui a anterior, e os votos nela voltam a zero.
Vence quem tiver mais votos. Em um empate, decide o voto do capitão: o
host no lado do host, o primeiro a entrar no outro. Com propostas e sem
votos, uma é sorteada. Sem proposta, o lado joga uma equipe predefinida
aleatória do seu tamanho, do tipo que o Criador de Equipes dá no início;
um lado de um só joga uma build inicial aleatória. Um grupo na fila cujo
plano de equipe não é aceito (um assento faltando, uma build ilegal)
também joga uma equipe predefinida aleatória, e é avisado quando a partida
abre. Cada lado sorteia a sua, então os dois podem jogar a mesma. Nenhum
lado vê as propostas, os votos ou a escolha do outro.

**Escolha.** Os personagens da build escolhida são assentos, cada um com o
personagem segurando as armas sobre as habilidades: clique em um assento
livre para pegá-lo, ou em outro livre para trocar, quem chegar primeiro leva, um
cada. Quem não pegou nada recebe o primeiro livre, e os bots jogam os
outros, com o nome do personagem. Então a partida começa, ou um grupo na
fila entra na fila.

Quem sai durante a Sala de Equipe deixa seu personagem para um bot, para o
lado manter o tamanho. Quem entra nessa hora só assiste.

Depois de uma partida de equipe na fila, os vencedores voltam à fila
sozinhos depois de 20 segundos, e os perdedores (e em empate também)
voltam ao menu; a partida de uma sala por código devolve todos à sala. Um
botão sob o resultado pula a espera ou, para os vencedores, sai sem entrar
na fila.
Os vencedores da Arena de Equipes mantêm o build de equipe e o lugar de cada jogador para a partida seguinte, sem sala de equipe, a não ser que o grupo tenha mudado nesse meio-tempo: alguém saiu, está ausente ou entrou. Nesse caso, escolhem a equipe de novo.
Se a tua equipa não ganhou, Parar suspende essa contagem para leres o resultado; depois o botão leva-te em frente quando estiveres pronto.

## Ascensão dos Heróis

Uma Ascensão dos Heróis na fila tem nove rodadas, sempre nesta ordem:
The Hollow Deep (Aniquilação), Blackwater Ford (Aniquilação de Sacerdotes), Barrow Field (Aniquilação de Sacerdotes), Cinder Sanctum (Corrida da Relíquia), Mosslit Cairns (Captura de Pontos), The Brazen Causeway (Aniquilação de Sacerdotes), Threefold
Keep (Rei da Colina), The Warden's Gallery (Captura de Pontos) e depois o Hall of Heroes. Enquanto você procura uma equipe, o ícone da fila na barra superior diz onde você está, \`Ascensão dos Heróis · rodada 2\`, e a janela da Sala mostra o mapa dessa rodada.
Você só encontra equipes na mesma rodada e espera por uma o tempo que for
preciso: nenhum bot completa. A única exceção: a partir da rodada 2, uma equipe sozinha na sua rodada por 60 segundos pode avançar. Ela enfrenta uma equipe que espera em qualquer rodada posterior antes do Hall, as duas jogam o mapa da equipe mais adiantada e a vencedora segue a partir dali. Uma rodada em um mapa feito para três
equipes espera três; duas equipes que esperaram 30 segundos pela terceira
jogam entre si, assim como duas cuja terceira nunca aparece na sala. Vença
e seu grupo sobe sozinho para o próximo mapa depois de 20 segundos; vença
no Hall e você fica para defendê-lo. Perca, ou saia de uma partida antes
do fim, e sua próxima Ascensão recomeça na rodada 1; o mesmo vale para
sair da fila ou do grupo. Uma partida perdida porque o host saiu mantém
sua rodada.

O Hall sorteia um de três modos para cada partida: Rei da Colina, Corrida da Relíquia ou Captura de Pontos, para duas ou três equipes. Com duas, a terceira base fica fechada, e com ela os pontos de captura das suas duas galerias. Uma partida no Hall dura 11 minutos e vence quem tiver mais pontos; a Captura de Pontos também termina antes com uma vantagem de 20. Morrer não custa moral. Os mortos voltam juntos à sua base a cada minuto cheio do relógio da partida, então uma equipe eliminada não está derrotada, mas uma equipe cujos jogadores saíram todos está fora. No Rei da Colina, a equipe que controla o altar continua pontuando depois que seu fantasma morre, até outra equipe tomá-lo, e seus mortos voltam no altar. Um empate vai para a equipe que pontuou por último ou, na Captura de Pontos, para a que fez a eliminação mais recente.

**A Câmara.** O Hall só se forma a cada 12 minutos no horário UTC, às :00, :12, :24, :36 e :48. Até lá, seu grupo espera na Câmara: o ícone da fila mostra o tempo até a próxima abertura e quem domina o Hall. Em cada abertura, quem o domina enfrenta até dois desafiantes, ou até três desafiantes se enfrentam se ninguém o dominar. Só participam os grupos que já esperavam antes da abertura, e os que ficarem sem vaga esperam a seguinte. Quem domina sem adversário mantém o Hall e espera, sem contar vitória, e um desafiante sozinho também espera. Quando um grupo vence o Hall, todos os jogos abertos dizem quem o domina: seu líder, ou a sigla da guilda se mais da metade do grupo a compartilhar.

Sua moral acompanha você por toda a campanha: a penalidade de morte ou o
bônus com que você termina um mapa vencido é o que você leva para o
próximo, de −60% a +10%. Uma campanha que termina, ou um jogador que entra
no meio dela, começa em 0. Sua própria aba lembra disso, até você fechá-la.

A equipe escolhe uma vez, na Sala de Equipe do primeiro mapa, e mantém sua
Build de Equipe e seus assentos no resto da campanha: depois de uma
vitória, volta à fila sem votação nem escolha. Quem sai no meio da
campanha libera o assento, mas não a build dele. Quem entra no grupo entre
mapas só escolhe entre os assentos vagos (**Livre: build de Monge**) e joga
a build desse assento; um assento vago que ninguém pegar é de um bot. Uma
derrota recomeça do zero: a próxima campanha vota de novo. O mesmo vale
para seguir seu host até outro grupo, cujo host não pode garantir a
campanha antiga. A rodada é lembrada pelo host do seu grupo, e só até você
fechar a aba. Uma sala de Ascensão dos Heróis por código joga o mapa da
rodada 1.

Um grupo com menos de 8 entra na fila com bots nos lugares vazios, usando sua Build de Equipe, mas um lado sempre tem pelo menos um humano, e uma equipe de bots nunca é adversária. Se o último humano de um lado sair de uma partida, esse lado desiste e sua subida termina.

**Barrow Field** (8v8, 5400x2600) é uma arena da Ascensão que você também pode escolher em uma Partida Hospedada: Aniquilação de Sacerdotes em um charco de túmulos ao entardecer, com o sacerdote ressuscitando seus mortos a cada 2 minutos. Suba em um túmulo para ter o terreno alto, ou siga a passagem dos túmulos por baixo dele quando uma alavanca no túmulo distante abrir o portão. Leve sua bandeira ao **Storm Beacon** no centro e ele atinge um inimigo aleatório ao alcance da voz com 50 de dano de raio a cada 2,5 segundos, até a outra equipe plantar a bandeira dela lá. Cada golpe é um raio do farol até quem ele atingiu, visível para as duas equipes.

Três arenas da Ascensão também podem ser escolhidas em uma Partida Hospedada: **The Hollow Deep** (8v8 de Aniquilação, 6200x2400, numa caverna escura: atravesse uma ponte de cordas sobre um abismo, suba por uma saliência central ou pegue a cripta por baixo dela quando uma alavanca numa plataforma de rocha abrir seu portão),
**Blackwater Ford** (8v8, 5200x2800, de Aniquilação de Sacerdotes em um vau escuro de rio:
dá para atravessar a pé um vau raso, cruzar a ponte quebrada sobre o moinho, apoiada em seus pilares,
ou pegar um bueiro sob a ponte assim que uma alavanca no moinho abre o portão dele; o sacerdote traz os mortos a cada 2
minutos) e
**Mosslit Cairns** (8v8, 5400x3000, de Captura de Pontos em cinco colinas de montes de pedras que brilham com musgo ao entardecer: dá para subir num monte pelas escadas dele, segurar o grande monte do meio, ou pegar o túnel de raízes sob as colinas do sul assim que uma alavanca num monte do norte abre os portões dele; os muros de raízes podem ser quebrados). A quarta é **The Brazen Causeway** (8v8, 5600x2800, de Aniquilação de Sacerdotes em uma calçada de pedra elevada sobre um pântano ao entardecer: dá para marchar pela calçada assim que uma alavanca na casa da guarda do outro lado abre o portão de bronze dela, atravessar o pântano até as escadas no meio dela, ou escapulir por um bueiro sob ela; o sacerdote traz os mortos a cada 2 minutos).

Um mapa pode ter **portões**: muros que param corpos, disparos e visão
enquanto fechados. Fique sobre a placa de pressão de um portão para
abri-lo. Ele fecha quando não sobra ninguém na placa, empurrando quem
estiver na passagem para o lado mais próximo e parando disparos que ainda
a atravessam, e não pode ser aberto de novo por meio segundo. Uma placa na
cor de uma equipe só responde a essa equipe. Os bots ficam na placa da
própria equipe quando não há inimigo por perto.

Cada percurso começa com a **Batalha dos Zaishen de Elite**, sem fila: seu grupo contra seis Zaishen controlados por bots (2 Monges, um Elementalista e mais 3). Ela é travada numa arena cerimonial (8v8, 5400x2400): arquibancadas em degraus ao norte e ao sul, estátuas sobre pedestais no piso rebaixado e uma cripta sob cada arquibancada, cuja grade levadiça é aberta por uma alavanca na arquibancada oposta. O relógio começa quando um de vocês cruza a linha de partida no meio da arena ou o primeiro Zaishen morre, o que acontecer primeiro. Matem os seis em menos de 30 segundos e o grupo começa o percurso com +10% de moral; em menos de 60, +8%; em menos de 80, +6%; em menos de 100, +4%; em menos de 120, +2%; mais devagar, nada. Se vencerem, o grupo entra sozinho na fila do primeiro mapa. Se o grupo inteiro cair, ou se algum Zaishen ainda estiver vivo ao fim do limite de 8 minutos, o percurso acaba.

Cada vitória de um percurso dá **fama**: 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36 nas treze primeiras e depois 40 cada, no máximo 300 por dia (o dia vira às 15:00 UTC). A Batalha dos Zaishen de Elite não dá fama. Sua fama total define sua **patente de herói**, de 1 com 25 de fama a 15 com 100.000, mostrada como ★ e um número ao lado do seu nome. Opções > Jogador mostra as duas. As duas ficam no seu dispositivo.

## Três equipes

Em uma partida de três equipes, a terceira equipe é desenhada em verde-limão, ao lado do azul
do seu lado e do vermelho do outro, e leva um ◆ antes das etiquetas de nome,
linhas do placar e tabela de fim de partida, para nunca ser diferenciada só pela cor.
O placar mostra sua equipe primeiro, depois as outras em ordem, e as tabelas de fim de partida colocam sua
equipe primeiro, depois a vencedora.

## Registros de partidas

Toda partida jogada até o fim, em qualquer modo e com bots incluídos, é
publicada pelo host como um registro público de partida nos relays Nostr
que o jogo usa. Qualquer pessoa pode ler, e não há como recusar. Um
registro traz o modo, o mapa, quando a partida acabou e quanto durou,
quem venceu e por quê, e o nome no jogo, a tag da guilda e a build de cada
jogador (o código de modelo do GW1: profissões, atributos e barra de
habilidades, sem equipamento), com os bots marcados como bots. A chave
pública de jogador de cada humano também está lá e desenha o sinete dele,
o escudo ao lado do nome; um sinete é só a chave que o host da partida
informou. Seu nome no jogo e sua chave estão em todo registro de uma
partida que você joga, então qualquer pessoa pode ligar essas partidas
entre si. Nada mais que possa identificar você está lá: nenhum endereço,
nenhum id de par, nenhuma sala. Uma partida que acaba porque o host saiu,
ou da qual todos saíram, não é publicada. Os registros são informados pelo
host, então um host pode errar; nada os confere com a partida.

Veja-os na página **Partidas**, abaixo de Criador de Equipes: as 50 mais
recentes dos últimos 7 dias, as mais novas primeiro, com as novas aparecendo conforme são
jogadas. Uma linha mostra os jogadores de cada equipe como o ícone da
profissão primária (passe o mouse para ver o nome), duas ou três equipes,
a vencedora sublinhada, e o mapa, a duração e quando. Toda linha é marcada
como **informado pelo host**. Clique em uma para ver as equipes, uma aba
cada, a da vencedora primeiro: o cartão da equipe. **Clonar** copia uma
equipe de uma partida terminada para suas Builds de Equipe, a build de
cada jogador com o nome dele, e a abre. Em um lado de 1v1, Clonar salva a build do jogador como um novo personagem e o abre, porque uma Build de Equipe é de 2, 4 ou 8.

Cada linha começa com o ícone do modo, e o ícone e a borda esquerda da
linha ficam na cor do modo: laranja Aleatória, azul Equipe, dourado
Ascensão, violeta GvG, verde Hospedada. Acima da lista, chips a filtram
por **Tipo** (Aleatória, Equipe, Ascensão, GvG, Hospedada) e **Tamanho**
(1v1, 2v2, 4v4, 8v8): pressione quantos quiser, e uma partida aparece se
corresponder a um tipo pressionado e a um tamanho pressionado; um grupo
sem nenhum pressionado deixa tudo passar. O tamanho é o da maior equipe,
com bots incluídos, então uma Partida Hospedada 3v2 não se encaixa em
nenhum tamanho. Os chips ficam como você os deixou até a página
recarregar.

**Minhas partidas**, depois dos chips, lista em vez disso as suas
próprias partidas: as últimas 50 que este navegador guardou para sua
chave de jogador atual, da mais nova para a mais antiga, de qualquer
idade, publicadas ou não, uma Batalha dos Zaishen de Elite também. Tipo
e Tamanho continuam filtrando, e sua equipe é marcada com **Você**. Abra
uma para ver três abas: **Builds**, as equipes com Clonar como acima;
**Estatísticas**, a tabela de placar que o painel final mostrou; e
**Diagrama**, os gráficos. Elas ficam guardadas só neste navegador.

Acima dos filtros, a faixa **Salão dos Heróis** lista os últimos 20 domínios, do mais recente ao mais antigo: quem domina (uma tag de guilda ou o nome do líder), as pessoas da equipe vencedora, quando a vitória mais recente terminou e, a partir de duas vitórias, quantas seguidas. Um domínio é uma sequência ininterrupta de vitórias no Salão de quem domina. A faixa lê os registros desta página, ignora os filtros e fica oculta se nenhum for uma vitória no Salão. Como todo registro, é o que o host de cada partida informou, e nada o verifica.

## Ranqueadas

Uma partida da fila sem bots é ranqueada: veja [Ranking](ranking.md).
`;export{e as default};
//# sourceMappingURL=modes-CZHEvDHo.js.map