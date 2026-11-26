# Classement

## Ce qui est classé

Tout match de la file sans bot est classé : Arène aléatoire et Arène
d’équipe. Une Partie hébergée, l’Entraînement et tout match avec un bot
ne sont pas classés. Il n’y a ni interrupteur ni file séparée. Un match
classé ne remplit jamais une place vide avec un bot.

## Ta cote

Ta cote appartient à ta clé de joueur, celle que ce navigateur
conserve. Tous les personnages que tu joues avec elle partagent cette
unique cote.

Les files classées associent des joueurs de cote proche et les
répartissent en équipes de cote moyenne proche. La recherche commence à
100 points de ta cote et s’élargit de 10 points par seconde d’attente,
jusqu’à 600, si bien que personne n’attend indéfiniment. Pendant que tu
attends, la file affiche ta cote.

Tes 10 premiers matchs cotés sont provisoires : la file indique
**Provisoire (3/10 matchs)** et tu n’as pas encore de rang. Ensuite, le
menu principal affiche ton rang. Les cotes s’érodent : chaque jour sans
match coté rend la tienne moins sûre, et le classement trie selon une
valeur prudente, donc si tu arrêtes de jouer ton rang baisse en
quelques semaines.

Dès que le classement compte 20 joueurs confirmés, un match classé ne
compte que si au moins un de ses joueurs est confirmé (10 matchs cotés
ou plus) : un match entre nouveaux joueurs uniquement n’est pas coté.
Joue contre quelqu’un de confirmé et tes matchs comptent.

Le bouton **Classement** de la barre du haut liste les 100 meilleurs
par rang, nom et cote, ta ligne mise en évidence.

Le rang de héros (★) n’est pas cette cote : il vient de la renommée,
voir [Ascension des héros](modes.md#ascension-des-héros).

## Début du match

Quand un match classé est trouvé, tout le monde le confirme dans les 15
secondes, et l’écran affiche **Confirmation du match classé…**. Si
quelqu’un ne confirme pas, le match est annulé et tout le monde retourne
dans la file.

## Fin du match

À la fin, tout le monde signe le résultat dans les 30 secondes. Ne pas
signer compte comme quitter, et quitter un match classé compte comme une
défaite, celle de l’hôte aussi. Le bouton quitter le dit. Un résultat ne
compte que si plus de la moitié des places l’ont signé.

## Ce qui est publié

Le reçu du match est publié sur des relais Nostr publics. Il contient la
clé publique et le nom de personnage de chaque joueur (un joueur sans
personnage y figure comme starter), et qui a joué contre qui. N’importe
qui peut le lire, et il ne peut pas être retiré. Les matchs non classés
ne publient rien.

## Quand ça se met à jour

Ta cote change dans l’heure, et le classement avec elle.
