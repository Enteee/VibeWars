# Compétences et builds

Un **build** est ce qu'un personnage apporte au combat : deux professions,
huit compétences et les points d'attribut derrière. Ouvre-en un avec
**Éditer** dans le menu principal, ou **Nouveau personnage**.

## Professions

Il y en a dix : Warrior, Ranger, Monk, Necromancer, Mesmer, Elementalist,
Assassin, Ritualist, Paragon et Dervish. Ta profession **principale** est ce
que tu es : ses compétences, et son **attribut principal** (marqué ★), que
seule une principale obtient. Ta **secondaire** te prête ses compétences, mais
pas son attribut principal.

## La barre de compétences

La barre a **huit emplacements**. Une seule compétence d'**élite** (cadre
doré) tient sur une barre : en équiper une deuxième remplace la première.
Appuie sur **×** sur un emplacement pour le vider.

Les **Flash enchantments** (Dervish) sont instantanés : en utiliser un
conserve ton geste et ta marche, tu peux donc les glisser entre deux coups.
Chacun désactive tes autres Flash enchantments pendant 1 seconde.

Les **formes** (les cinq Avatars de Dervish : Balthazar, Dwayna, Grenth, Lyssa
et Melandru) te transforment pendant plus d'une minute. Une forme n'est pas
un enchantement, personne ne peut donc la retirer, et tu ne peux être que
dans une forme à la fois. En utiliser une la désactive pendant 45 secondes.
Quand une forme prend fin, tu arrêtes ce que tu faisais : ton attaque, ta
marche et toute compétence en cours. Appuie de nouveau sur une touche de
déplacement pour repartir.

**Certains tirs désactivent tes autres attaques.** Focused Shot et Needling
Shot volent plus vite qu'une flèche ne devrait, mais chacun qui touche
désactive tes autres compétences d'attaque quelques secondes. Les sorts ne
sont pas concernés.

## Attributs

Tu as **200 points** à dépenser. Chaque rang d'un attribut coûte plus que le
précédent, jusqu'au rang 12 ; la ligne montre ce que coûte le suivant. Douze,
douze et trois dépensent tout. Les runes et le casque peuvent ajouter jusqu'à
quatre rangs de plus ; voir [Équipement](equipment.md). Augmenter l'attribut
qu'utilise une compétence la rend plus forte : les nombres qui grandissent
avec l'attribut sont affichés en vert et en gras, à tes rangs actuels, runes
et casque compris.

En combat, tes rangs peuvent changer un moment. Weakness retire un rang à
chacun. Certains maléfices mettent les attributs d'un ennemi à 0, et Master of
Magic met tes attributs élémentaires à 13 : un rang fixé ainsi prime sur les
runes comme sur Weakness. Signet of Illusions permet à tes prochains sorts
d'autres attributs d'utiliser ton rang d'Illusion Magic. Certaines compétences
augmentent tes attributs pour un temps ou pour tes prochains sorts, comme
Glyph of Elemental Power et Ritual Lord, même un attribut laissé à 0 ; un rang
fixé, comme celui de Master of Magic, l'emporte sur un tel bonus.

## Échos

Les **échos** d'un Paragon sont de longs bonus sur un allié. Un **refrain** se
renouvelle à sa pleine durée, et un **finale** prend effet, chaque fois qu'un
chant ou un cri prend fin sur cet allié. Un chant ou un cri réappliqué avant
sa fin n'a pas pris fin. Rien ne retire un écho : il prend fin quand il
expire ou que son porteur meurt. La plupart ne peuvent pas cibler un esprit.

## Compétences qui deviennent une autre compétence

Certaines compétences de Mesmer placent une autre compétence dans leur propre
emplacement pendant un moment. Arcane Echo et Echo copient la prochaine
compétence que tu utilises. **Inspired Enchantment** et **Inspired Hex**
deviennent la compétence qui a lancé l'enchantement ou le maléfice qu'ils ont
retiré, pendant 20 secondes. **Arcane Thievery** devient le sort qu'elle a
désactivé chez ton ennemi, tant que dure la désactivation. La copie a sa
propre recharge. Quand elle prend fin, la compétence d'origine revient et
commence sa propre recharge, et une incantation de la copie encore en cours
échoue. Un statut posé par un esprit ou par un autre statut ne peut pas être
copié, mais le retirer te rend quand même l'énergie.

## Puits et glyphes

Les **puits** d'un Necromancer exploitent le cadavre le plus proche. Sans
cadavre à proximité, un puits sacrifie à la place 66% de ta santé et apparaît
là où tu te tiens.

Les **glyphes** d'un Elementalist modifient ton prochain sort : il ne peut pas
être interrompu, se lance instantanément, se recharge aussitôt ou coûte moins.
Un nouveau glyphe remplace celui que tu avais.

## Interventions

Une compétence qui réagit à « la prochaine fois que des dégâts font passer la
santé sous N% » réagit à tout coup ou vol de vie qui te laisse en vie sous la
limite, même si tu y étais déjà avant le coup, et jamais à la santé que tu
sacrifies ou perds par dégénérescence. La protection contre les dégâts
mortels, comme Judge's Intervention, annule tout le coup fatal : aucun dégât,
aucune mort. Faithful Intervention et Illusion of Weakness n'ont pas de durée :
elles durent jusqu'à ce que des dégâts, un retrait ou la mort y mettent fin,
et te soignent au passage.

## La bibliothèque

La bibliothèque de compétences liste chaque compétence utilisable par tes deux
professions, groupée par attribut. Cherche dans les noms et le texte à côté
du bouton **Filtres**. Filtres ouvre une fenêtre où tu choisis des types de
compétences ou **Élite seulement** pour réduire la liste ; **OK**, Esc ou un
clic à l'extérieur la ferme. Le bouton compte ce qui est actif
(**Filtres · 2**), et chaque filtre apparaît à côté comme une étiquette :
clique sur une étiquette pour désactiver ce filtre, ou sur **clear** pour tout
désactiver. Les compétences des autres professions attendent, repliées, sous
**Autres professions**.

Les groupes d'attributs sont repliés au départ : clique sur le nom d'un groupe
pour l'ouvrir. Une recherche ou un filtre ouvre chaque groupe où il trouve
quelque chose.

À côté de l'éditeur, le **terrain d'entraînement** te permet d'essayer ta
barre sur des cibles d'entraînement avant un match. Son journal montre chaque
compétence que toi ou un bot utilisez, l'adrénaline gagnée, et une compétence
restée sans effet, avec ce qu'elle attendait. Certaines cibles bougent : dans
**Moving targets**, l'une marche en boucle, une te fuit et une te poursuit. Son
compteur compte les dégâts et les soins de tes esprits, serviteurs et familier
comme les tiens.

## Sorts d'objet

Les **sorts d'objet** d'un Ritualist placent les **cendres** d'un esprit dans
tes mains : un bonus tant que tu les tiens, et un **effet de chute** quand
elles tombent. Elles tombent quand elles expirent, quand tu meurs, quand tu
appuies sur **Lâcher cendres** au-dessus de ta barre de santé, que tu lances
un autre sort d'objet, utilises un shadow step, changes d'armes ou prends un
drapeau ou une relique. Tes mains sont prises tant que tu les tiens : ni
attaques ni compétences d'attaque, mais tu marches à pleine vitesse et lances
toujours des sorts. Rien ne retire les cendres ; toute fin est une chute.

## Shadow steps

Un **shadow step** te déplace aussitôt, sans marche entre les deux. La plupart
t'amènent à ta cible ; certains te ramènent à l'endroit où tu les as lancés
quand ils prennent fin, comme Shadow of Haste et Shadow Walk. **Recall** ne
t'amène à son allié qu'à sa fin, et désactive toutes tes compétences pendant
3 secondes. **Swap** échange ta place avec l'un des esprits ou serviteurs de
ton camp.

## Partager des builds

Dans le menu **⋯** de l'éditeur, **Partager** donne ton build sous forme d'une
ligne de texte, et **Partager en code GW1** sous forme de code de modèle GW1.
Appuie sur **Copier** et envoie-le.

Pour en récupérer un, choisis **Charger code GW1** sous **⋯**, colle le code
et appuie sur **Charger**. S'il ne peut pas être chargé, la raison s'affiche
sous le champ. En raccourci, tu peux aussi coller un code n'importe où dans
l'éditeur hors d'un champ de texte. Les deux types de code marchent dans les
deux sens. Une compétence GW1 que VibeWars n'a pas encore arrive comme un
emplacement vide. Le build est à toi une fois que tu appuies sur **Sauver**.

**Sauver** garde ton build et te ramène d'où tu viens. **Esc** quitte sans
enregistrer, et demande d'abord si tu as changé quelque chose. **Partager**,
**Charger code GW1**, **Dupliquer** et **Supprimer** sont sous **⋯**.

Un code d'équipe se colle plutôt dans l'**Atelier d'équipes**.

## Builds d'équipe

Un **Build d'équipe** est une équipe de ses propres personnages, créée dans
l'**Atelier d'équipes** et gardée à part de tes personnages. Chacun est une
carte là-bas, et seulement là-bas : **Nouveau build** en crée un, et un clic
sur une carte, ou son **Éditer**, l'ouvre. Tu en proposes un dans le
[Salon d'équipe](modes.md#salon-déquipe).

Chaque Build d'équipe a une taille, 2v2, 4v4 ou 8v8 (il n'y a pas de Build
d'équipe 1v1) : la **Taille d'équipe** de la barre latérale. L'Atelier
d'équipes liste les Builds d'équipe de la taille choisie là, et **Nouveau
build** en crée un de cette taille. La taille d'un Build d'équipe est fixe :
son éditeur l'affiche verrouillée, et pour jouer une autre taille, tu crées
un autre Build d'équipe. Une équipe collée garde sa taille, et la barre
latérale s'y aligne.

Un Build d'équipe a toujours autant de membres que sa taille : un nouveau
commence avec un personnage vierge à chaque place. Tu n'ajoutes ni ne retires
jamais de membre, tu en remplaces un. Chaque ligne montre le personnage du
membre avec les armes qu'il tient, un point par set d'armes quand il en a
plusieurs, sa santé et son énergie maximales, et ses huit compétences ; fais
glisser une ligne par son ⠿ pour réordonner. Le panneau de droite est la
bibliothèque de l'Atelier de personnages, avec un onglet **Mes personnages**
avant **Compétences** et **Équipement**. Sur **Mes personnages**, fais glisser
un de tes personnages sur un membre pour faire de ce membre une copie. Une
copie appartient à l'équipe : la modifier, ou modifier le personnage d'origine,
laisse l'autre tel quel. Sur **Compétences**, la bibliothèque de compétences
montre les compétences du dernier membre cliqué ; fais-en glisser une sur
l'emplacement de n'importe quel membre pour l'y équiper. Sur la barre de ce
membre, une compétence déjà présente se déplace vers l'emplacement. Un dépôt
qu'un membre ne peut pas accepter, une compétence d'une autre profession ou
déjà sur la barre d'un autre membre, est signalé par un emplacement en
pointillés et la raison, et ne fait rien. Fais glisser une compétence déjà sur
la barre d'un membre vers n'importe quel emplacement pour l'y déplacer, en
échangeant sa place avec ce qu'elle y trouve ; maintiens **Shift** en la
déposant sur un autre membre pour la copier à la place. Une barre garde une
seule élite et aucune compétence en double, et un dépôt qui enfreindrait cela
est refusé de la même façon. Les compétences de chaque membre sont affichées
en icônes ; survole-en une pour ses détails, clique dessus pour trouver chaque
copie dans l'équipe.
Le **▼** d'un membre l'ouvre sur place (**▲** le ferme), sous sa ligne : ses
professions, son nom, ses rangs d'attribut, sa barre et son équipement se
modifient là directement. Comme dans l'Atelier de personnages, clique sur un
emplacement de sa barre et **Équiper** y place une compétence ; sans
emplacement choisi, elle va au premier vide. **Équipement** contient les armes
et mains gauches du membre ouvert, et n'est là que quand un membre est ouvert :
clique sur une pour l'équiper, ou fais-la glisser sur ses mains. Un seul membre
est ouvert à la fois ; **Esc** le ferme. Une nouvelle profession retire les
compétences et rangs qu'elle ne peut pas utiliser, avec un **Annuler**.
Appuie sur le nom d'un membre, ou sur **Ouvrir dans l'écran Personnage**, pour
le modifier dans l'éditeur de build ; son **Sauver** le remet dans l'équipe,
et le **Sauver** de l'équipe garde le tout et te ramène à l'Atelier d'équipes.
**Esc** quitte sans enregistrer, et demande d'abord. **Partager**,
**Dupliquer** et **Supprimer** de l'équipe sont sous **⋯**.
Tu peux enregistrer une équipe à tout moment, problèmes compris, mais seule
une équipe sans problème peut être proposée dans un Salon d'équipe : une carte
indique **Non jouable** et pourquoi, et une équipe sans nom s'affiche comme
**Équipe sans nom**.
Ton premier démarrage tire une équipe prête à la taille choisie, 4v4 sauf si
tu l'as changée, marquée **Aléatoire** : son **Relancer** en met une autre à
la place, et **Cloner** te donne une copie à modifier.
