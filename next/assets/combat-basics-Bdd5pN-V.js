var e=`# Bases du combat

## Santé et énergie

Tu commences avec 500 de **santé** et 50 d'**énergie** ; les runes et le
moral modifient les deux. Les compétences coûtent de l'énergie, qui revient
toute seule, lentement. Les ![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warriors** et les ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** la récupèrent le plus
lentement, les ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Rangers** un peu plus vite, tous les autres le plus vite.

Les flèches sur tes barres sont des **pips** : chacune est de la santé ou de
l'énergie qui revient, ou qui s'écoule, un peu chaque seconde. ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**,
![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning** et ![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison** drainent la santé ; Regeneration et les sorts de soin en
ajoutent. Hors combat pendant 5 secondes, ta santé commence à revenir toute
seule, d'autant plus vite que tu restes hors combat.

## Adrénaline

Les ![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warriors**, les ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** et d'autres ont des compétences qui coûtent de
l'**adrénaline** au lieu de l'énergie. Chacune se charge de son côté :
chaque coup d'arme que tu portes leur donne à toutes un coup d'adrénaline,
et recevoir un gros coup aussi. En utiliser une la vide et retire un coup
aux autres. Hors combat pendant 25 secondes, elles se vident toutes.

## Utiliser une compétence

Une compétence peut prendre un moment à **lancer**, puis il lui faut du
temps pour se **recharger** avant de resservir. Si ta cible est hors de
portée, tu marches d'abord jusqu'à elle. Bouger, ou Esc, annule une
incantation : l'énergie est perdue, mais la compétence ne se recharge pas.
Après toute compétence avec un temps d'incantation, sauf une ![Compétence d'attaque](../../../apps/web/public/icons/skill-type/attack.svg) **compétence d'attaque**, il y a une courte pause où tu ne peux pas agir.

Une compétence pressée pendant que tu en utilises une autre, ou pendant
cette pause, est **mise en attente** : elle part ensuite, et son emplacement
pulse jusque-là. Une seule attend ; en presser une autre la remplace. Bouger,
Esc, une interruption ou une mise à terre l'annule.

Les ![Cri](../../../apps/web/public/icons/skill-type/shout.svg) **cris** et ![Posture](../../../apps/web/public/icons/skill-type/stance.svg) **postures** ne sont jamais mis en attente : ils partent tout de
suite, même pendant que tu lances une autre compétence, pendant cette pause
ou à terre. L'incantation continue. Utilisés ainsi, ils ne te font pas
marcher : hors de portée, ils sont refusés.

## Interruptions et mises à terre

Une **interruption** arrête la compétence d'un ennemi pendant qu'il la
lance. Son énergie est dépensée et la compétence se recharge ; certaines
interruptions bloquent aussi la compétence un moment. Trop tôt ou trop tard,
il ne se passe rien.

Chaque profession a son propre son quand elle lance une compétence ; écoute celui de ta cible.

La plupart des interruptions arrêtent aussi une simple attaque en plein
geste : ce coup n'arrive jamais et le geste recommence. Un ennemi qui marche
encore vers sa cible n'a rien à interrompre. Une interruption dont la carte
dit « a skill » ou « a spell » laisse les simples attaques tranquilles.

Certaines ![Posture](../../../apps/web/public/icons/skill-type/stance.svg) **postures**, comme Mantra of Concentration, arrêtent une interruption
qui te vise. Aucune n'arrête une mise à terre.

**À terre**, tu ne peux ni bouger, ni attaquer, ni utiliser une compétence
pendant un moment, sauf un ![Cri](../../../apps/web/public/icons/skill-type/shout.svg) **cri** ou une posture, et une incantation en cours
échoue.

## Altérations, maléfices et enchantements

Les **altérations** te font du mal jusqu'à ce qu'elles expirent ou soient
retirées :

| Altération                                                                                  | Effet                                                     |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ![Bleeding](../../../apps/web/public/icons/status/bleeding.svg) **Bleeding**                | draine la santé                                           |
| ![Burning](../../../apps/web/public/icons/status/burning.svg) **Burning**                   | draine la santé rapidement                                |
| ![Poison](../../../apps/web/public/icons/status/poison.svg) **Poison**                      | draine la santé                                           |
| ![Disease](../../../apps/web/public/icons/status/disease.svg) **Disease**                   | draine la santé, et se propage à tes voisins              |
| ![Crippled](../../../apps/web/public/icons/status/crippled.svg) **Crippled**                | tu avances à mi-vitesse                                   |
| ![Blind](../../../apps/web/public/icons/status/blind.svg) **Blind**                         | la plupart de tes attaques ratent                         |
| ![Weakness](../../../apps/web/public/icons/status/weakness.svg) **Weakness**                | tes coups d'arme sont bien plus faibles                   |
| ![Cracked Armor](../../../apps/web/public/icons/status/cracked-armor.svg) **Cracked Armor** | moins d'armure                                            |
| ![Deep Wound](../../../apps/web/public/icons/status/deep-wound.svg) **Deep Wound**          | moins de santé maximale, et les soins marchent moins bien |
| ![Dazed](../../../apps/web/public/icons/status/dazed.svg) **Dazed**                         | sorts lents à lancer ; toute attaque les interrompt       |

Les ![Maléfice](../../../apps/web/public/icons/skill-type/hex.svg) **maléfices** sont lancés sur toi par les ennemis ; les ![Enchantement](../../../apps/web/public/icons/skill-type/enchantment.svg) **enchantements**
par toi ou tes alliés. Chacun est retiré par son propre type de compétence.
Certains enchantements sont **maintenus** : ils durent jusqu'à ce que tu y
mettes fin, et coûtent un pip d'énergie tant qu'ils tournent. Double-clique
sur son icône pour en terminer un.

Quelques compétences cessent de fonctionner quand tu es enchanté, et
reprennent quand tu ne l'es plus. Une compétence qui dure pour tes
« prochaines N attaques » compte chaque attaque : un coup raté ou bloqué en
consomme une autant qu'un coup réussi.

## Armure et dégâts

Les ![Warrior](../../../apps/web/public/icons/profession/warrior.svg) **Warriors** et les ![Paragon](../../../apps/web/public/icons/profession/paragon.svg) **Paragons** portent le plus d'armure ; les ![Ranger](../../../apps/web/public/icons/profession/ranger.svg) **Rangers**, les
![Assassin](../../../apps/web/public/icons/profession/assassin.svg) **Assassins** et les ![Dervish](../../../apps/web/public/icons/profession/dervish.svg) **Dervishes** moins ; les lanceurs de sorts le moins. L'armure
réduit les dégâts d'arme, élémentaires, de chaos et de ténèbres. Les dégâts
sacrés, d'ombre et sans type, les drains de santé et les vols de vie
l'ignorent. Seuls les coups d'arme peuvent être critiques.
Certains enchantements immunisent leur porteur contre les coups critiques.

## Mort, résurrection et moral

Dans la plupart des modes, les morts restent à terre jusqu'à ce qu'un allié
les **ressuscite** avec une compétence, comme Resurrection Signet, que tout
le monde peut prendre. Certains modes ramènent les morts par vagues, ou tout
seuls ; voir [Modes](modes.md).

Tant que tu es mort, une ligne sous le tableau des scores décompte
jusqu'à ton retour, ou te dit d'attendre qu'on te ressuscite. La fenêtre
du groupe affiche le décompte à côté de chaque allié mort.

Chaque mort te coûte 15% de **moral**, jusqu'à -60% : ta santé et ton énergie
maximales baissent d'autant. Chaque ennemi tué par ton équipe t'en rend 2%,
jusqu'à 0. En Bataille de guilde, tenir le Socle du drapeau le fait monter
au-delà, jusqu'à +10%.
`;export{e as default};
//# sourceMappingURL=combat-basics-Bdd5pN-V.js.map