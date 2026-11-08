var e=`# Equipamento

A parte de **Equipamento** do editor de builds guarda suas armas e
armadura. Arraste armas e mãos secundárias da biblioteca à direita, ou
clique em uma para equipar. A armadura é escolhida na figura, abaixo.

## Conjuntos de armas

Você leva até **quatro conjuntos de armas**, cada um com uma arma e, se a
arma deixar uma mão livre, uma mão secundária, como um escudo ou um foco.
O conjunto 1 é o inicial; os outros podem ficar vazios.

Em uma partida, troque de conjunto com **1 a 4** (**F1 a F4** nas teclas
do perfil Clássico). A troca espera a conjuração ou o golpe em andamento
terminar; andar ou Esc troca na hora. Não há tempo de espera. Seus
ataques, as habilidades que precisam de certa arma e sua energia máxima
seguem o conjunto em mãos.

Uma arma precisa de nível 9 no atributo dela: abaixo disso, ela causa um
terço do dano, e o editor avisa em vermelho. Uma espada é sempre
Swordsmanship, mas um cajado, uma varinha, um escudo ou um foco é feito
para um atributo que você escolhe: clique na mão correspondente na figura
(**6** para a arma, **7** para a mão secundária) e escolha um.

## Mods de arma

Toda arma e mão secundária tem espaços para mods: um **Prefixo**, um
**Sufixo** e uma **Inscrição**. Clique na mão na figura, ou na linha dela
ao lado, para escolher; cada um diz o que faz. Varinha, escudo e foco não
aceitam prefixo; mãos vazias também não. Um mod sempre tem seu melhor
valor, e cada conjunto de armas usa os seus, então trocar de conjunto
troca os mods também: vida e energia máximas acompanham o conjunto em
mãos. Trocar de arma mantém os mods que ainda servem e diz quais foram
descartados.

| Mod                       | Espaço    | Serve em                                    | Efeito                                       |
| ------------------------- | --------- | ------------------------------------------- | -------------------------------------------- |
| Defensive                 | Prefixo   | Cajado                                      | Armadura +5                                  |
| Hale                      | Prefixo   | Cajado                                      | +30 de vida                                  |
| Insightful                | Prefixo   | Cajado                                      | Energia +5                                   |
| of Defense                | Sufixo    | qualquer arma marcial, Cajado               | Armadura +5                                  |
| of Fortitude              | Sufixo    | qualquer arma marcial, Cajado, Escudo, Foco | +30 de vida                                  |
| of Shelter                | Sufixo    | qualquer arma marcial, Cajado               | Armadura +7 (contra dano físico)             |
| of Warding                | Sufixo    | qualquer arma marcial, Cajado               | Armadura +7 (contra dano elemental)          |
| "Cast Out the Unclean"    | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Disease em você    |
| "Fear Cuts Deeper"        | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Bleeding em você   |
| "I Can See Clearly Now"   | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Blinded em você    |
| "I have the power!"       | Inscrição | qualquer arma marcial                       | Energia +5                                   |
| "Leaf on the Wind"        | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano de gelo)           |
| "Like a Rolling Stone"    | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano de terra)          |
| "Live for Today"          | Inscrição | Foco                                        | Energia +15, regeneração de energia -1       |
| "Not the face!"           | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano contundente)       |
| "Only the Strong Survive" | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Weakness em você   |
| "Pure of Heart"           | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Poison em você     |
| "Riders on the Storm"     | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano de raio)           |
| "Seize the Day"           | Inscrição | Cajado, Varinha                             | Energia +15, regeneração de energia -1       |
| "Sleep Now in the Fire"   | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano de fogo)           |
| "Soundness of Mind"       | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Dazed em você      |
| "Strength of Body"        | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Deep Wound em você |
| "Swift as the Wind"       | Inscrição | Escudo, Foco                                | Reduz em 20% a duração de Crippled em você   |
| "The Riddle of Steel"     | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano cortante)          |
| "Through Thick and Thin"  | Inscrição | Escudo, Foco                                | Armadura +10 (contra dano perfurante)        |

### Prefixos marciais ao acertar

| Prefixo                      | Serve em                       | O que faz ao acertar                                                    |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Vampiric                     | qualquer arma marcial          | rouba 3 de vida (5 em martelo, foice, arcos); -1 de regeneração de vida |
| Zealous                      | qualquer arma marcial          | ganha 1 de energia; -1 de regeneração de energia                        |
| Sundering                    | qualquer arma marcial          | 20% de chance de +20% de penetração de armadura                         |
| Furious                      | marciais, exceto arcos         | 10% de chance de adrenalina em dobro                                    |
| Barbed, Crippling, Poisonous | marciais, exceto martelo       | Bleeding, Crippled, Poison que você causa duram 33% mais                |
| Cruel                        | marciais, exceto arcos         | Deep Wound que você causa dura 33% mais                                 |
| Heavy                        | machado, martelo, foice, lança | Weakness que você causa dura 33% mais                                   |
| Silencing                    | adagas, lança, arcos           | Dazed que você causa dura 33% mais                                      |
| Ebon, Fiery, Icy, Shocking   | qualquer arma marcial          | o dano dela vira de terra, fogo, gelo ou raio                           |

"Ao acertar" significa um acerto de um ataque ou de uma habilidade de
ataque: um golpe bloqueado ou que errou não faz nada. Uma condição mais
longa é uma causada pela sua habilidade de ataque.

### Mods que dependem do seu estado

Os mods que dependem do seu estado só contam enquanto ele durar. "Acima"
ou "abaixo de metade da vida" é estrito: exatamente na metade, nenhum
conta. Quando um máximo aumentado acaba, a vida ou a energia acima do
novo máximo se perde.

| Mod                                                | Espaço, serve em             | O que faz                                                          |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| "Strength and Honor"                               | inscrição, marcial           | +15% de dano de arma acima de metade da vida                       |
| "Guided by Fate", "Dance with Death"               | inscrição, marcial           | +15% de dano de arma enquanto encantado, em uma postura            |
| "Too Much Information"                             | inscrição, marcial           | +15% de dano de arma contra um inimigo amaldiçoado                 |
| "Vengeance is Mine"                                | inscrição, marcial           | +20% de dano de arma abaixo de metade da vida                      |
| "Don't Fear the Reaper"                            | inscrição, marcial           | +20% de dano de arma enquanto amaldiçoado                          |
| "To the Pain!"                                     | inscrição, marcial           | +15% de dano de arma; -10 de armadura enquanto ataca               |
| "Brawn over Brains"                                | inscrição, marcial           | +15% de dano de arma; -5 de energia                                |
| "Hale and Hearty", "Have Faith"                    | inscrição, qualquer arma     | +5 de energia acima de metade da vida, enquanto encantado          |
| "Don't call it a comeback!", "I am Sorrow."        | inscrição, qualquer arma     | +7 de energia abaixo de metade da vida, enquanto amaldiçoado       |
| of Devotion, of Endurance                          | sufixo, cajado, escudo, foco | +45 de vida enquanto encantado, em uma postura                     |
| of Valor                                           | sufixo, cajado, escudo, foco | +60 de vida enquanto amaldiçoado                                   |
| "Luck of the Draw"                                 | inscrição, escudo ou foco    | 20% de chance de um golpe físico causar 5 a menos                  |
| "Sheltered by Faith", "Run For Your Life!"         | inscrição, escudo ou foco    | golpes físicos causam 2 a menos enquanto encantado, em uma postura |
| "Nothing to Fear"                                  | inscrição, escudo ou foco    | golpes físicos causam 3 a menos enquanto amaldiçoado               |
| "Hail to the King", "Faith is My Shield"           | inscrição, foco              | +5 de armadura acima de metade da vida, enquanto encantado         |
| "Might makes Right", "Knowing is Half the Battle." | inscrição, foco              | +5 de armadura enquanto ataca, enquanto conjura um feitiço         |
| "Man for All Seasons", "Survival of the Fittest"   | inscrição, foco              | +5 de armadura contra dano elemental, físico                       |
| "Ignorance is Bliss", "Life is Pain"               | inscrição, foco              | +5 de armadura; -5 de energia, -20 de vida                         |
| "Down But Not Out", "Be Just and Fear Not"         | inscrição, foco              | +10 de armadura abaixo de metade da vida, enquanto amaldiçoado     |

O dano de arma é o valor sorteado pela própria arma: o dano bônus de uma
habilidade de ataque não aumenta.

### Mods de conjurador

Os mods de conjurador valem só para feitiços, cada um com sua própria
chance quando você usa um. "O atributo do item" é o atributo para o qual
o cajado, a varinha ou o foco foi feito. Dois mods de metade que ativem
juntos ainda reduzem à metade só uma vez.

| Mod                         | Espaço, serve em             | O que faz                                                                      |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| Adept                       | prefixo, cajado              | 20% de chance de reduzir à metade a conjuração de feitiços do atributo do item |
| Swift                       | prefixo, cajado              | 10% de chance de reduzir à metade a conjuração de qualquer feitiço             |
| of Aptitude                 | sufixo, foco                 | 20% de chance de reduzir à metade a conjuração de feitiços do atributo do item |
| of Swiftness                | sufixo, foco                 | 10% de chance de reduzir à metade a conjuração de qualquer feitiço             |
| "Aptitude not Attitude"     | inscrição, cajado ou varinha | 20% de chance de reduzir à metade a conjuração de feitiços do atributo do item |
| "Don't think twice"         | inscrição, cajado ou varinha | 10% de chance de reduzir à metade a conjuração de qualquer feitiço             |
| of Memory                   | sufixo, varinha              | 20% de chance de reduzir à metade a recarga de feitiços do atributo do item    |
| of Quickening               | sufixo, varinha              | 10% de chance de reduzir à metade a recarga de qualquer feitiço                |
| "Let the Memory Live Again" | inscrição, cajado ou varinha | 10% de chance de reduzir à metade a recarga de qualquer feitiço                |
| "Forget Me Not"             | inscrição, foco              | 20% de chance de reduzir à metade a recarga de feitiços do atributo do item    |
| "Serenity Now"              | inscrição, foco              | 10% de chance de reduzir à metade a recarga de qualquer feitiço                |
| of Mastery                  | sufixo, cajado               | 20% de chance de o atributo do item valer +1 em um feitiço                     |
| "Master of My Domain"       | inscrição, escudo ou foco    | 20% de chance de o atributo do item valer +1 em um feitiço                     |
| of Enchanting               | sufixo, marcial ou cajado    | encantamentos que você conjura duram 20% mais                                  |

## Armadura

A armadura tem cinco peças: cabeça, peito, mãos, pernas e pés. Toda peça
tem dois espaços de melhoria:

- uma **Insígnia**, um pequeno extra naquela peça: mais armadura contra
  dano físico, por exemplo, ou enquanto você ataca;
- uma **Runa**.

Seu **Capacete** dá +1 em um atributo que você escolhe.

No editor, a armadura é uma figura. Clique em uma peça numerada nela, ou
na linha dela ao lado, para escolher a insígnia e a runa; cada escolha diz
o que faz naquela peça. **Aplicar insígnia a todas as 5** coloca a que
você escolheu em todas as peças. A figura mostra a insígnia e a runa de
cada peça e segura as armas do conjunto que você está vendo, com seus
mods.

## Runas

| Runa                                   | O que dá                                 |
| -------------------------------------- | ---------------------------------------- |
| Runa de atributo Minor                 | +1 em um atributo                        |
| Runa de atributo Major                 | +2 em um atributo, -35 de vida           |
| Runa de atributo Superior              | +3 em um atributo, -75 de vida           |
| Vigor                                  | mais vida (+30, +41 ou +50)              |
| Vitae                                  | +10 de vida                              |
| Attunement                             | mais energia (+3, +6 ou +9)              |
| Clarity, Purity, Recovery, Restoration | duas condições cada acabam 20% mais cedo |
| Absorption (Warrior)                   | menos dano físico de cada golpe          |

Você escolhe a runa de uma peça no mesmo lugar da insígnia: clique na
peça na figura.

O editor soma tudo para você: vida, energia, armadura e dano, como ficam
com seu primeiro conjunto de armas.
`;export{e as default};
//# sourceMappingURL=equipment-DPht5VQR.js.map