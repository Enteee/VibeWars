var e=`# Ranking

## O que é ranqueado

Toda partida da fila sem bots é ranqueada: Arena Aleatória e Arena de
Equipes. Uma Partida Hospedada, o Campo de Treino e qualquer partida
com um bot são sem ranking. Não há opção para isso nem fila separada.
Uma partida ranqueada nunca preenche uma vaga vazia com um bot.

## Sua classificação

Sua classificação pertence à sua chave de jogador, a que este navegador
guarda. Todas as personagens que você joga nele compartilham essa única
classificação.

As filas ranqueadas juntam jogadores de classificação parecida e os
dividem em equipes de classificação média parecida. A busca começa a
100 pontos da sua classificação e se amplia em 10 pontos a cada segundo
de espera, até 600, para que ninguém espere para sempre. Enquanto você
espera, a fila mostra sua classificação.

Suas primeiras 10 partidas classificadas são provisórias: a fila diz
**Provisória (3/10 partidas)** e você ainda não tem posição. Depois
disso, o menu principal mostra sua posição. As classificações decaem:
cada dia sem partida classificada torna a sua menos certa, e a tabela
de líderes ordena por um valor prudente, por isso, se você parar de
jogar, sua posição desce em semanas.

Assim que a tabela de líderes tiver 20 jogadores estabelecidos, uma
partida ranqueada só conta se pelo menos um jogador nela estiver
estabelecido (10 ou mais partidas classificadas): uma partida só entre
jogadores novos não é classificada. Jogue com alguém estabelecido e
suas partidas contam.

O botão **Tabela de líderes** na barra superior lista os 100 primeiros
por posição, nome e classificação, com a sua linha destacada.

A patente de herói (★) não é esta classificação: ela vem da fama, veja
[Ascensão dos Heróis](modes.md#ascensão-dos-heróis).

## Início da partida

Quando uma partida ranqueada é encontrada, todos a confirmam em até 15
segundos, e a tela mostra **Confirmando partida ranqueada…**. Se
alguém não confirmar, a partida é cancelada e todos voltam à fila.

## Fim da partida

No fim, todos assinam o resultado em até 30 segundos. Não assinar conta
como sair, e sair de uma partida ranqueada conta como derrota, também
para o anfitrião. O botão de sair avisa isso. Um resultado só vale se
mais da metade das vagas o assinou.

## O que é publicado

O recibo da partida vai para relays Nostr públicos. Ele contém a chave
pública e o nome da personagem de cada jogador (um jogador sem
personagem aparece como starter) e quem jogou contra quem. Qualquer
pessoa pode lê-lo, e ele não pode ser retirado. Partidas sem ranking
não publicam nada.

## Quando é atualizado

Sua classificação muda em até uma hora, e a tabela de líderes junto.
`;export{e as default};
//# sourceMappingURL=ranking-DCZSj4-L.js.map