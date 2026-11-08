var e=`# Habilidades e builds

Uma **build** é o que um personagem leva para a luta: duas profissões,
oito habilidades e os pontos de atributo por trás delas. Abra uma com
**Editar** no menu principal, ou **Novo personagem**.

## Profissões

São dez: Warrior, Ranger, Monk, Necromancer, Mesmer, Elementalist,
Assassin, Ritualist, Paragon e Dervish. Sua profissão **primária** é o que
você é: as habilidades dela e seu **atributo primário** (marcado com ★),
que só uma primária recebe. Sua **secundária** empresta as habilidades
dela, mas não o atributo primário.

## A barra de habilidades

A barra tem **oito espaços**. Só uma habilidade de **elite** (moldura
dourada) cabe em uma barra: equipe uma segunda e ela substitui a
primeira. Pressione **×** em um espaço para esvaziá-lo.

**Encantamentos relâmpago** (Dervish) são instantâneos: usar um mantém seu
golpe e seu passo, então você pode encaixá-los entre os golpes. Cada um
desliga seus outros encantamentos relâmpago por 1 segundo.

**Formas** (os cinco Avatares de Dervish: Balthazar, Dwayna, Grenth, Lyssa
e Melandru) transformam você por mais de um minuto. Uma forma não é um
encantamento, então ninguém pode removê-la, e você só pode estar em uma
forma por vez. Usar uma a desativa por 45 segundos. Quando uma forma
acaba, você para o que estava fazendo: seu ataque, sua caminhada e
qualquer habilidade que estivesse ativando. Pressione uma tecla de
movimento de novo para continuar andando.

**Alguns disparos desativam seus outros ataques.** Focused Shot e Needling
Shot voam mais rápido do que uma flecha deveria, mas cada um que acerta
desliga suas outras habilidades de ataque por alguns segundos. Feitiços
não são afetados.

## Atributos

Você tem **200 pontos** para gastar. Cada nível de um atributo custa mais
que o anterior, até o nível 12; a linha mostra quanto custa o próximo.
Doze, doze e três gastam tudo. Runas e capacete podem somar até quatro
níveis a mais; veja [Equipamento](equipment.md). Aumentar o atributo que
uma habilidade usa a deixa mais forte: números que crescem com o atributo
aparecem em verde e negrito, nos seus níveis atuais, incluindo runas e
capacete.

Em uma luta, seus níveis podem mudar por um tempo. Weakness tira um de
cada. Algumas maldições zeram os atributos de um inimigo, e Master of
Magic coloca os seus elementais em 13: um nível definido assim prevalece
sobre runas e Weakness. Signet of Illusions faz seus próximos feitiços de
outros atributos usarem seu nível de Illusion Magic. Algumas habilidades
aumentam seus atributos por um tempo ou para seus próximos feitiços, como
Glyph of Elemental Power e Ritual Lord, mesmo um que você deixou em 0; um
nível definido, como o de Master of Magic, vence esse aumento.

## Ecos

Os **ecos** de um Paragon são efeitos longos em um aliado. Um **refrão**
se renova até a duração total, e um **final** faz efeito, sempre que um
cântico ou grito termina nesse aliado. Um cântico ou grito reaplicado
antes de terminar não terminou. Nada remove um eco: ele acaba quando se
esgota ou quando quem o tem morre. A maioria não pode ter um espírito
como alvo.

## Habilidades que viram outra habilidade

Algumas habilidades de Mesmer colocam outra habilidade no próprio espaço
por um tempo. Arcane Echo e Echo copiam a próxima habilidade que você usa.
**Inspired Enchantment** e **Inspired Hex** viram a habilidade que
conjurou o encantamento ou a maldição que removeram, por 20 segundos.
**Arcane Thievery** vira o feitiço que desativou no seu inimigo, enquanto
a desativação durar. A cópia tem sua própria recarga. Quando ela acaba, a
habilidade original volta e inicia sua própria recarga, e uma conjuração
da cópia ainda em andamento falha. Um status colocado por um espírito ou
por outro status não pode ser copiado, embora removê-lo ainda dê a
energia.

## Poços e glifos

Os **poços** de um Necromancer exploram o cadáver mais próximo. Sem
nenhum por perto, o poço sacrifica 66% da sua vida e aparece onde você
está.

Os **glifos** de um Elementalist mudam seu próximo feitiço: ele não pode
ser interrompido, sai instantâneo, recarrega na hora ou custa menos. Um
novo glifo substitui o que você tinha.

## Intervenções

Uma habilidade que responde "da próxima vez que o dano deixar a vida
abaixo de N%" responde a qualquer golpe ou roubo de vida que deixe você
vivo e abaixo da linha, mesmo que você já estivesse abaixo antes do
golpe, e nunca a vida que você sacrifica ou perde por degeneração. A
proteção contra dano fatal, como Judge's Intervention, anula todo o
golpe mortal: sem dano, sem morte. Faithful Intervention e Illusion of
Weakness não têm duração: duram até que dano, uma remoção ou a morte as
encerre, e curam você enquanto duram.

## A biblioteca

A biblioteca de habilidades lista todas as habilidades que suas duas
profissões podem usar, agrupadas por atributo. Busque nomes e texto ao
lado do botão **Filtros**. Filtros abre uma janela onde você escolhe tipos
de habilidade ou **Só elite** para reduzir a lista; **Concluir**, Esc ou
um clique fora a fecha. O botão conta o que está ativo (**Filtros · 2**),
e cada filtro aparece ao lado como uma etiqueta: clique em uma etiqueta
para desligar esse filtro, ou em **clear** para desligar todos.
Habilidades de outras profissões ficam, recolhidas, em **Outras
profissões**.

Os grupos de atributo começam recolhidos: clique no nome de um grupo para
abrir. Uma busca ou um filtro abre todo grupo em que encontrar algo.

Ao lado do editor, o **campo de treino** permite testar sua barra em
alvos de treino antes de uma partida. O registro mostra cada habilidade
que você ou um bot usa, a adrenalina que você ganha e uma habilidade que
não teve efeito, com o que ela esperava. Alguns alvos se mexem: em
**Moving targets**, um anda em círculos, um foge de você e um persegue
você. O medidor conta o dano e a cura dos seus espíritos, lacaios e
mascote como seus.

## Feitiços de item

Os **feitiços de item** de um Ritualist colocam as **cinzas** de um
espírito nas suas mãos: um bônus enquanto você as segura e um **efeito ao
largar** quando elas caem. Elas caem quando acabam, quando você morre,
quando pressiona **Largar cinzas** acima da barra de vida, conjura outro
feitiço de item, salta pelas sombras, troca de armas ou pega uma bandeira
ou relíquia. Suas mãos ficam ocupadas enquanto as segura: sem ataques e
sem habilidades de ataque, mas você anda em velocidade total e ainda
conjura feitiços. Nada remove as cinzas; todo fim é uma queda.

## Saltos pelas sombras

Um **salto pelas sombras** move você na hora, sem caminhar. A maioria
leva você até o alvo; alguns levam você de volta ao lugar onde os
conjurou quando acabam, como Shadow of Haste e Shadow Walk. **Recall**
leva você até o aliado só quando acaba e desativa todas as suas
habilidades por 3 segundos. **Swap** troca de lugar com um dos espíritos
ou lacaios do seu lado.

## Compartilhar builds

No menu **⋯** do editor, **Compartilhar** dá sua build como uma linha de
texto, e **Compartilhar como código GW1** como um código de modelo do GW1.
Pressione **Copiar** e envie.

Para receber uma, escolha **Carregar código GW1** em **⋯**, cole o código
e pressione **Carregar**. Se não carregar, o motivo aparece embaixo do
campo. Como atalho, você também pode colar um código em qualquer lugar do
editor que não seja um campo de texto. Os dois tipos de código funcionam
dos dois jeitos. Uma habilidade do GW1 que o VibeWars ainda não tem chega
como um espaço vazio. A build é sua quando você pressiona **Salvar**.

**Salvar** guarda sua build e leva você de volta para onde estava.
**Esc** sai sem salvar e pergunta antes se você mudou algo.
**Compartilhar**, **Carregar código GW1**, **Duplicar** e **Excluir**
ficam em **⋯**.

Um código de equipe é colado no **Criador de Equipes**.

## Builds de Equipe

Uma **Build de Equipe** é uma equipe com personagens próprios, feita no
**Criador de Equipes** e guardada separada dos seus personagens. Cada uma
é um cartão ali, e só ali: **Nova build de equipe** cria uma, e um clique
em um cartão, ou em **Editar**, a abre. Você propõe uma na
[Sala de Equipe](modes.md#sala-de-equipe).

Toda Build de Equipe tem um tamanho, 2v2, 4v4 ou 8v8 (não existe Build de
Equipe 1v1): o **Tamanho** na barra lateral. O Criador de Equipes lista as
Builds de Equipe do tamanho escolhido ali, e **Nova build de equipe** cria
uma desse tamanho. O tamanho de uma Build de Equipe é fixo: o editor o
mostra travado, e para jogar outro tamanho você faz outra Build de Equipe.
Uma equipe colada mantém o tamanho, e a barra lateral muda para ele.

Uma Build de Equipe sempre tem tantos membros quanto seu tamanho: uma nova
começa com um personagem em branco em cada lugar. Você nunca adiciona nem
remove um membro, você substitui. Cada linha mostra o personagem do membro
com as armas que ele segura, um ponto para cada conjunto de armas quando
ele tem mais de um, sua vida e energia máximas e suas oito habilidades;
arraste uma linha pelo ⠿ para reordenar. O painel à direita é a biblioteca
do Criador de Personagem, com uma aba **Meus personagens** antes de
**Habilidades** e **Equip.**. Em **Meus personagens**, arraste um dos seus
personagens sobre um membro para torná-lo uma cópia dele. Uma cópia é da
própria equipe: mudar ela, ou o personagem de origem, não afeta o outro.
Em **Habilidades**, a biblioteca mostra as habilidades do último membro em
que você clicou; arraste uma para o espaço de qualquer membro para
equipá-la ali. Na própria barra desse membro, uma habilidade que já está
nela vai para o espaço. Algo que um membro não pode receber, uma
habilidade de outra profissão ou uma que já está na barra de outro membro,
é marcado com um espaço tracejado e o motivo, e não faz nada. Arraste uma
habilidade que já está na barra de um membro para qualquer espaço para
movê-la, trocando de lugar com o que estiver ali; segure **Shift** ao
soltar em outro membro para copiá-la. Uma barra continua com uma elite e
sem habilidades repetidas, então o que quebraria isso é recusado do mesmo
jeito. As habilidades de cada membro aparecem como ícones; passe o mouse
sobre um para ver os detalhes, clique para encontrar todas as cópias na
equipe.
O **▼** de um membro o abre ali mesmo (**▲** fecha), embaixo da linha: as
profissões, o nome, os níveis de atributo, a barra de habilidades e o
equipamento mudam ali. Como no Criador de Personagem, clique em um espaço
da barra e **Equipar** coloca uma habilidade nele; sem nenhum escolhido,
ela vai para o primeiro vazio. **Equip.** tem as armas e mãos secundárias
do membro aberto, e só aparece enquanto houver um aberto: clique em uma
para equipar, ou arraste até as mãos dele. Só um membro fica aberto por
vez; **Esc** o fecha. Uma nova profissão descarta as habilidades e níveis
que ela não pode usar, com **Desfazer**.
Pressione o nome de um membro, ou **Abrir na tela de Personagem**, para
editá-lo no editor de builds; **Salvar** ali o devolve à equipe, e o
**Salvar** da própria equipe guarda tudo e leva você de volta ao Criador
de Equipes. **Esc** sai sem salvar e pergunta antes. **Compartilhar**,
**Duplicar** e **Excluir** da equipe ficam em **⋯**.
Você pode salvar uma equipe a qualquer momento, mesmo com problemas, mas
só uma equipe sem problemas pode ser proposta em uma Sala de Equipe: um
cartão diz **Não jogável** e o motivo, e uma equipe sem nome aparece como
**Equipe sem nome**.
Seu primeiro início sorteia uma equipe pronta no tamanho escolhido, 4v4 se
você não mudou, marcada com **Aleatória**: **Sortear** troca por outra, e
**Clonar** dá uma cópia para editar.
`;export{e as default};
//# sourceMappingURL=skills-and-builds-CLvZ3Tcr.js.map