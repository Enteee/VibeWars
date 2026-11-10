var e=`# Bots

Um **bot** é um jogador controlado pelo jogo. Em uma sala que você
hospeda, os bots ocupam toda vaga que ninguém pegar, para você treinar ou
jogar com menos amigos.

## Quem joga como bot

Ninguém adiciona bots: uma sala lista só as pessoas. Quando a
[Sala de Equipe](modes.md#sala-de-equipe) termina, cada lado joga a Build
de Equipe que escolheu, e cada personagem que ninguém pegou é jogado por
um bot, com o nome desse personagem. Um lado sem ninguém joga uma equipe
predefinida aleatória, só de bots. Quem sai durante a Sala de Equipe deixa
seu personagem para um bot.

Na sala e na Sala de Equipe, um bot parece um jogador qualquer. Na
partida, ele leva a marca **BOT** na placa de nome, no quadro do alvo, na
janela do grupo e no resumo da partida.

Os bots são feitos para uma partida: quando ela acaba, a sala volta a
listar só as pessoas, e os bots da próxima partida são criados do zero.

## Como os bots lutam

Um bot joga o papel que a build dele dá. Quem usa arma corpo a corpo é da
**linha de frente**: avança e ataca o alvo. Quem tem duas ou mais curas
ou proteções para usar em um aliado é **curandeiro**: fica atrás do
aliado mais ferido, longe dos inimigos. Quando dois ou mais inimigos
focam um aliado, o curandeiro coloca a proteção nele antes do golpe
acertar. Todos os outros bots são **à distância**: ficam onde todos os
seus ataques alcançam e param para lutar com um inimigo que chega perto
demais. Bots à distância e curandeiros vão para onde menos inimigos os
alcançam e usam pilares como cobertura. Uma equipe se volta contra
qualquer inimigo ao alcance que caia abaixo de 60% de vida, para
acabar com ele. Em Rei da Colina, enquanto sua equipe não controla o
altar, o Herói Fantasmagórico da outra equipe no altar vem antes até
disso. Um bot que se adianta demais espera os outros antes de seguir.

Os bots de dano guardam os golpes grandes, habilidades de ataque e
feitiços de dano, e os soltam juntos no alvo da equipe, para que o dano
caia de uma vez em vez de pingar devagar e ser curado: o feitiço mais
lento sai primeiro, e um mais rápido sai depois na medida em que é mais
rápido. Enquanto isso, eles continuam golpeando e conjurando maldições e
condições. Um bot espera os colegas no máximo quatro segundos e nem
espera para acabar com um inimigo abaixo de 30% de vida. Quando o alvo
está sob um encantamento protetor, como Protective Spirit ou Aegis, um
bot que remove encantamentos, como com Strip Enchantment, tira esse
encantamento primeiro, e os outros seguram os golpes para isso.

Um bot muito ferido que está perdendo a luta recua para trás do
curandeiro ou para a base e descansa fora de alcance até recuperar a
maior parte da vida.

Um bot só ressuscita um aliado caído quando os inimigos não estão em cima
do corpo, quando há mais gente da equipe dele do que da deles perto do
corpo, e nunca enquanto um inimigo próximo está mirando nele.

Os bots desviam de cerca de metade dos disparos mirados neles, como um
Fireball ou a flecha de uma habilidade de ataque, então parar ou virar
funciona com eles como funciona com você.

Os bots contornam o chão em chamas e outras zonas nocivas quando o desvio
não é muito mais longo, e saem de qualquer uma em que estejam.

Um bot com interrupção a guarda para as conjurações que importam: uma
ressurreição ou um Herói Fantasmagórico tomando o altar primeiro, depois
uma cura ou proteção, uma habilidade de elite ou um golpe grande, como
uma habilidade de ataque ou um feitiço de dano. Todo o resto, e um golpe
simples de arma, ele deixa passar. Como um jogador, ele erra cerca de uma
em cada quatro dessas conjurações.

Um bot leva um instante humano, uma fração de segundo, para reagir ao que
acontece, então uma interrupção rápida ou uma esquiva de última hora
podem vencê-lo.

Em uma luta de três equipes, os bots enfrentam uma equipe inimiga por
vez: a que os está atacando ou, se ninguém estiver, a mais ferida ao
alcance. Eles continuam nessa equipe até outra colocar claramente mais
jogadores sobre eles, e não avançam contra uma equipe descansada enquanto
outra os ataca. Um alvo anunciado pela equipe deles vem primeiro, seja de
qual equipe for. Só jogadores contam: o fantasma ou os guardas de uma
equipe por perto não fazem os bots se voltarem contra ela.

## Arena Aleatória

Uma Arena Aleatória não tem bots: toda vaga é de um jogador de verdade, e
você espera até haver gente suficiente na fila.
`;export{e as default};
//# sourceMappingURL=bots-DrKlbtDl.js.map