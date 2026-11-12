# Bots

Un **bot** est un joueur que le jeu contrôle pour toi. Dans un salon que tu
héberges, des bots prennent toutes les places libres : tu peux ainsi
t'entraîner, ou jouer avec moins d'amis.

## Qui joue un bot

Personne n'ajoute de bots : un salon ne liste que ses joueurs. À la fin du
[Salon d'équipe](modes.md#salon-déquipe), chaque camp joue le Build d'équipe
qu'il a choisi, et chacun de ses personnages que personne n'a pris est joué
par un bot, sous le nom de ce personnage. Un camp sans personne joue une
équipe préréglée au hasard, entièrement de bots. Quelqu'un qui part pendant
le Salon d'équipe laisse son personnage à un bot.

Dans le salon et le Salon d'équipe, un bot ressemble à n'importe qui. En
match, il porte l'étiquette **BOT** sur sa plaque de nom, le cadre de cible,
la fenêtre de groupe et le résumé du match.

Les bots sont créés pour un seul match : une fois celui-ci fini, le salon
liste de nouveau ses joueurs, et les bots du match suivant sont créés à neuf.

## Comment les bots se battent

Un bot joue le rôle que son build lui donne. Celui qui manie une arme de
mêlée est en **première ligne** : il s'approche et attaque sa cible. Celui
qui a au moins deux soins ou protections à lancer sur un allié est un
**soigneur** : il se place derrière l'allié le plus blessé, loin des
ennemis. Quand au moins deux ennemis se concentrent sur un allié, un
soigneur place sa protection sur cet allié avant que le coup ne tombe. Tous
les autres bots sont **à distance** : ils restent là où toutes leurs
attaques portent, et tiennent tête à un ennemi qui s'approche trop. Les bots
à distance et les soigneurs se déplacent là où moins d'ennemis peuvent les
atteindre, et utilisent les piliers comme abri. Une équipe se retourne sur
tout ennemi à portée qui passe sous 60% de santé, pour l'achever. En Roi de
la colline, tant que ton équipe ne tient pas l'autel, le Héros fantomatique
adverse sur l'autel passe même avant. Un bot qui prend trop d'avance sur son
équipe attend les autres avant de continuer.

Sans ennemi à proximité, un bot actionne le levier qui ouvre un chemin plus court vers les ennemis. Deux bots abattent aussi un mur qui cache un chemin bien plus court, en le frappant de leurs armes.

Les bots attaquants gardent leurs gros coups, compétences d'attaque et sorts
de dégâts, et les lancent ensemble sur la cible de l'équipe : les dégâts
tombent d'un coup au lieu d'arriver au compte-gouttes pour qu'un soigneur
les efface. Le sort le plus lent part en premier, un plus rapide d'autant
plus tard qu'il est rapide. Pendant ce temps, ils continuent de frapper et
de lancer leurs maléfices et altérations. Un bot attend ses coéquipiers
quatre secondes au plus, et n'attend pas du tout pour achever un ennemi sous
30% de santé. Quand la cible est sous un enchantement protecteur comme
Protective Spirit ou Aegis, un bot qui a un retrait d'enchantement, comme
Strip Enchantment, l'enlève d'abord, et les autres retiennent leurs coups
en attendant.

Un bot gravement blessé qui perd son combat se replie derrière son soigneur,
ou à sa base, et se repose hors de portée jusqu'à avoir récupéré l'essentiel
de sa santé.

Un bot ne ressuscite un allié tombé que si les ennemis ne sont pas sur le
corps, avec plus de ses alliés que d'ennemis autour, et jamais tant qu'un
ennemi proche cible le bot lui-même.

Les bots esquivent environ la moitié des projectiles qui les visent, comme
une Fireball ou la flèche d'une compétence d'attaque : s'arrêter ou tourner
marche pour eux comme pour toi.

Les bots contournent le sol en feu et les autres zones nocives quand le
détour n'est pas beaucoup plus long, et sortent de celle où ils se trouvent.

Un bot avec une interruption la garde pour les incantations qui comptent :
d'abord une résurrection ou un Héros fantomatique qui prend l'autel, puis un
soin ou une protection, une compétence d'élite, ou un gros coup comme une
compétence d'attaque ou un sort de dégâts. Il laisse passer tout le reste,
et un simple coup d'arme. Comme un joueur, il rate environ une de ces
incantations sur quatre.

Un bot prend un temps de réaction humain, une fraction de seconde, face à ce
qui se passe : une interruption rapide ou une esquive tardive peut le battre.

Dans un combat à trois équipes, les bots affrontent une équipe ennemie à la
fois : celle qui les attaque, ou, si personne ne le fait, la plus blessée à
portée. Ils restent sur cette équipe jusqu'à ce qu'une autre envoie nettement
plus de joueurs sur eux, et ne chargent pas une équipe fraîche tant qu'une
autre les attaque. Une cible annoncée par leur équipe passe en premier,
quelle que soit son équipe. Seuls les joueurs comptent : le fantôme ou les
gardes d'une équipe qui se trouvent à proximité ne poussent pas les bots à
se retourner contre elle.

## Arène aléatoire

Une Arène aléatoire n'a aucun bot : chaque place est un vrai joueur, et tu
attends qu'il y en ait assez dans la file.
