var e=`# Noções básicas de combate

## Vida e energia

Você começa com 480 de **vida** e 20 de **energia**, e sua armadura soma
energia: nada para um Guerreiro, 5 para um Patrulheiro, um Assassino ou um
Dervixe, 10 para todos os outros. Um cajado soma mais 10 enquanto você o
segura. A armadura de um Dervixe também soma 25 de vida. Runas e moral mudam as duas. Habilidades custam energia, e ela volta sozinha, devagar.
![Guerreiro](../../../apps/web/public/icons/profession/warrior.svg) **Guerreiros** e ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** recuperam mais devagar, ![Patrulheiro](../../../apps/web/public/icons/profession/ranger.svg) **Patrulheiros** um pouco mais rápido,
e todos os outros mais rápido ainda.

As setas nas suas barras são **pips**: cada uma é vida ou energia
voltando, ou sendo drenada, um pouco a cada segundo. ![Sangramento](../../../apps/web/public/icons/status/bleeding.svg) **Sangramento**, ![Queimadura](../../../apps/web/public/icons/status/burning.svg) **Queimadura** e
![Veneno](../../../apps/web/public/icons/status/poison.svg) **Veneno** drenam vida; Regeneration e feitiços de cura adicionam. Fora da
luta por 5 segundos, sua vida começa a voltar sozinha, mais rápido
quanto mais tempo você ficar fora.

## Adrenalina

![Guerreiro](../../../apps/web/public/icons/profession/warrior.svg) **Guerreiros**, ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** e outros têm habilidades que custam **adrenalina** em
vez de energia. Cada uma dessas habilidades carrega por conta própria:
cada golpe de arma que você acerta dá um impulso a cada uma delas, e
levar um golpe forte também. Usar uma a esvazia e tira um impulso das
outras. Fora da luta por 25 segundos, todas esvaziam.

## Usar uma habilidade

Uma habilidade pode levar um instante de **conjuração** e depois precisa
de tempo de **recarga** antes de ser usada de novo. Se o alvo estiver
fora de alcance, você anda até ele primeiro. Andar, ou Esc, cancela uma
conjuração: a energia é gasta, mas a habilidade não recarrega. Depois de
qualquer habilidade com tempo de conjuração, exceto uma ![Habilidade de ataque](../../../apps/web/public/icons/skill-type/attack.svg) **habilidade de
ataque**, há uma pausa curta em que você não pode agir.

Uma habilidade que você pressiona enquanto usa outra, ou nessa pausa, fica
**na fila**: ela sai em seguida, e o espaço dela pulsa até isso acontecer.
Só uma espera; pressionar outra a substitui. Andar, Esc, uma interrupção
ou uma derrubada a descartam.

![Grito](../../../apps/web/public/icons/skill-type/shout.svg) **Gritos** e ![Postura](../../../apps/web/public/icons/skill-type/stance.svg) **posturas** nunca ficam na fila: saem na hora, mesmo enquanto
você conjura outra habilidade, nessa pausa ou derrubado. A conjuração
continua. Usados assim, não fazem você andar até o alvo: fora de alcance,
são recusados.

## Interrupções e derrubada

Uma **interrupção** para a habilidade de um inimigo enquanto ele a
conjura. A energia dele é gasta e a habilidade recarrega; algumas
interrupções também travam a habilidade por um tempo. Interrompa cedo ou
tarde demais e nada acontece.

Cada profissão tem o próprio som ao usar uma habilidade; escute o do seu alvo.

A maioria das interrupções também para um ataque simples no meio do
golpe: esse golpe nunca acerta e o movimento recomeça. Um inimigo que
ainda está andando até o alvo não tem o que interromper. Uma interrupção
cujo cartão diz "a skill" ou "a spell" não afeta um ataque simples.

Algumas ![Postura](../../../apps/web/public/icons/skill-type/stance.svg) **posturas**, como Mantra of Concentration, impedem uma interrupção
mirada em você. Nenhuma delas impede uma derrubada.

**Derrubado**, você não pode andar, atacar nem usar habilidades por um
instante, exceto um ![Grito](../../../apps/web/public/icons/skill-type/shout.svg) **grito** ou uma postura, e uma conjuração em andamento
falha.

## Condições, maldições e encantamentos

**Condições** machucam você até acabarem ou serem removidas:

| Condição                                                                                          | O que faz                                                |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ![Sangramento](../../../apps/web/public/icons/status/bleeding.svg) **Sangramento**                | drena vida                                               |
| ![Queimadura](../../../apps/web/public/icons/status/burning.svg) **Queimadura**                   | drena vida rápido                                        |
| ![Veneno](../../../apps/web/public/icons/status/poison.svg) **Veneno**                            | drena vida                                               |
| ![Doença](../../../apps/web/public/icons/status/disease.svg) **Doença**                           | drena vida e passa para corpos do mesmo tipo ao seu lado |
| ![Aleijado](../../../apps/web/public/icons/status/crippled.svg) **Aleijado**                      | você anda na metade da velocidade                        |
| ![Cegueira](../../../apps/web/public/icons/status/blind.svg) **Cegueira**                         | a maioria dos seus ataques erra                          |
| ![Fraqueza](../../../apps/web/public/icons/status/weakness.svg) **Fraqueza**                      | seus golpes de arma ficam bem mais fracos                |
| ![Armadura Rachada](../../../apps/web/public/icons/status/cracked-armor.svg) **Armadura Rachada** | menos armadura                                           |
| ![Ferida Profunda](../../../apps/web/public/icons/status/deep-wound.svg) **Ferida Profunda**      | menos vida máxima, e as curas funcionam menos            |
| ![Atordoado](../../../apps/web/public/icons/status/dazed.svg) **Atordoado**                       | feitiços saem devagar; qualquer ataque os interrompe     |

Lacaios (exceto o Golem de Carne), fantasmas e espíritos não sangram, não são envenenados nem adoecem, e os espíritos não recebem nenhuma maldição nem nenhuma condição além de **Queimadura**.

![Maldição](../../../apps/web/public/icons/skill-type/hex.svg) **Maldições** são conjuradas em você por inimigos; ![Encantamento](../../../apps/web/public/icons/skill-type/enchantment.svg) **encantamentos**, por
você ou por aliados. Cada um é removido pelo seu próprio tipo de
habilidade. Alguns encantamentos são **mantidos**: duram até você
encerrá-los e custam um pip de energia enquanto duram. Clique duas vezes
no ícone, ou coloque o foco nele e pressione Enter ou Delete, para
encerrar um.

Algumas habilidades param de funcionar enquanto você está encantado e
voltam quando você não está mais. Uma habilidade que dura seus "próximos
N ataques" conta todo ataque, então um erro ou um bloqueio gasta um tanto
quanto um acerto.

## Armadura e dano

![Guerreiro](../../../apps/web/public/icons/profession/warrior.svg) **Guerreiros** e ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** usam mais armadura; ![Patrulheiro](../../../apps/web/public/icons/profession/ranger.svg) **Patrulheiros**, ![Assassino](../../../apps/web/public/icons/profession/assassin.svg) **Assassinos** e ![Dervixe](../../../apps/web/public/icons/profession/dervish.svg) **Dervixes**,
menos; conjuradores, menos ainda. A armadura reduz dano de arma,
elemental, de caos e sombrio. Dano sagrado, de sombra e sem tipo, drenos
de vida e roubo de vida a ignoram. Só golpes de arma podem ser críticos.
Alguns encantamentos deixam quem os tem imune a acertos críticos.

## Morte, ressurreição e moral

Na maioria dos modos, os mortos ficam caídos até um aliado os
**ressuscitar** com uma habilidade, como Resurrection Signet, que
qualquer um pode levar. Alguns modos trazem os mortos de volta em ondas
ou sozinhos; veja [Modos](modes.md).

Enquanto você está morto, uma linha abaixo do placar faz a contagem
regressiva até você voltar, ou diz para esperar ser ressuscitado. A
janela do grupo mostra a contagem ao lado de cada aliado morto.

Cada morte custa 15% de **moral**, até -60%: sua vida e sua energia
máximas diminuem junto. Cada inimigo morto pela sua equipe devolve 2%,
até 0. Em uma Batalha de Guildas, controlar o suporte da bandeira leva
acima disso, até +10%.
`;export{e as default};
//# sourceMappingURL=combat-basics-eSY-5pBj.js.map