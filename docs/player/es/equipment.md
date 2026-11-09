# Equipo

La parte de **Equipo** del editor de builds tiene tus armas y tu armadura.
Arrastra armas y manos secundarias desde la biblioteca de la derecha, o haz
clic en una para equiparla. La armadura se elige en la figura, más abajo.

## Sets de armas

Llevas hasta **cuatro sets de armas**, cada uno con un arma y, si el arma
deja una mano libre, una mano secundaria como un Shield o un Focus. El set 1
es con el que empiezas; los demás pueden quedar vacíos.

En una partida, cambia de set con **1 a 4** (**F1 a F4** con las teclas de
Clásico). El cambio espera a que termine el lanzamiento o golpe en curso;
moverte o Esc cambia al instante. No hay tiempo de espera. Tus ataques, las
habilidades que requieren cierta arma y tu energía máxima siguen al set que
tienes en la mano.

Un arma necesita rango 9 en su atributo: por debajo golpea con un tercio de
su daño, y el editor lo avisa en rojo. Una Sword siempre es de Swordsmanship,
pero un Staff, una Wand, un Shield o un Focus se hace para el atributo que
elijas: haz clic en su mano en la figura (**6** para el arma, **7** para la
mano secundaria) y elige uno.

## Mods de arma

Cada arma y mano secundaria tiene huecos para mods: un **prefijo**, un
**sufijo** y una **inscripción**. Haz clic en la mano de la figura, o en su
fila al lado, para elegirlos; cada uno dice qué hace. Una Wand, un Shield y
un Focus no llevan prefijo; las manos vacías tampoco. Un mod siempre tiene su
mejor valor, y cada set de armas lleva los suyos, así que cambiar de set
cambia también sus mods: la salud y la energía máximas varían con el set que
tienes en la mano. Al cambiar un arma se conservan los mods que aún le sirven
y se te dice cuáles perdió.

| Mod                       | Hueco       | Sirve para                                   | Efecto                                           |
| ------------------------- | ----------- | -------------------------------------------- | ------------------------------------------------ |
| Defensive                 | Prefijo     | Staff                                        | Armadura +5                                      |
| Hale                      | Prefijo     | Staff                                        | +30 de salud                                     |
| Insightful                | Prefijo     | Staff                                        | Energía +5                                       |
| of Defense                | Sufijo      | cualquier arma marcial, Staff                | Armadura +5                                      |
| of Fortitude              | Sufijo      | cualquier arma marcial, Staff, Shield, Focus | +30 de salud                                     |
| of Shelter                | Sufijo      | cualquier arma marcial, Staff                | Armadura +7 (contra daño físico)                 |
| of Warding                | Sufijo      | cualquier arma marcial, Staff                | Armadura +7 (contra daño elemental)              |
| "Cast Out the Unclean"    | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Disease sobre ti    |
| "Fear Cuts Deeper"        | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Bleeding sobre ti   |
| "I Can See Clearly Now"   | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Blind sobre ti      |
| "I have the power!"       | Inscripción | cualquier arma marcial                       | Energía +5                                       |
| "Leaf on the Wind"        | Inscripción | Shield, Focus                                | Armadura +10 (contra daño de frío)               |
| "Like a Rolling Stone"    | Inscripción | Shield, Focus                                | Armadura +10 (contra daño de tierra)             |
| "Live for Today"          | Inscripción | Focus                                        | Energía +15, regeneración de energía -1          |
| "Not the face!"           | Inscripción | Shield, Focus                                | Armadura +10 (contra daño contundente)           |
| "Only the Strong Survive" | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Weakness sobre ti   |
| "Pure of Heart"           | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Poison sobre ti     |
| "Riders on the Storm"     | Inscripción | Shield, Focus                                | Armadura +10 (contra daño de rayo)               |
| "Seize the Day"           | Inscripción | Staff, Wand                                  | Energía +15, regeneración de energía -1          |
| "Sleep Now in the Fire"   | Inscripción | Shield, Focus                                | Armadura +10 (contra daño de fuego)              |
| "Soundness of Mind"       | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Dazed sobre ti      |
| "Strength of Body"        | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Deep Wound sobre ti |
| "Swift as the Wind"       | Inscripción | Shield, Focus                                | Reduce un 20% la duración de Crippled sobre ti   |
| "The Riddle of Steel"     | Inscripción | Shield, Focus                                | Armadura +10 (contra daño cortante)              |
| "Through Thick and Thin"  | Inscripción | Shield, Focus                                | Armadura +10 (contra daño perforante)            |

### Prefijos marciales al golpear

| Prefijo                      | Sirve para                 | Qué hace al golpear                                                       |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| Vampiric                     | cualquier arma marcial     | roba 3 de salud (5 con Hammer, Scythe, Bows); -1 de regeneración de salud |
| Zealous                      | cualquier arma marcial     | da 1 de energía; -1 de regeneración de energía                            |
| Sundering                    | cualquier arma marcial     | 20% de probabilidad de +20% de penetración de armadura                    |
| Furious                      | marcial, no Bows           | 10% de probabilidad de adrenalina doble                                   |
| Barbed, Crippling, Poisonous | marcial, no Hammer         | el Bleeding, Crippled y Poison que causas duran un 33% más                |
| Cruel                        | marcial, no Bows           | el Deep Wound que causas dura un 33% más                                  |
| Heavy                        | Axe, Hammer, Scythe, Spear | la Weakness que causas dura un 33% más                                    |
| Silencing                    | Daggers, Spear, Bows       | el Dazed que causas dura un 33% más                                       |
| Ebon, Fiery, Icy, Shocking   | cualquier arma marcial     | su daño pasa a ser de tierra, fuego, frío o rayo                          |

"Al golpear" significa un golpe conectado de un ataque o una habilidad de
ataque: uno bloqueado o fallado no hace nada. Una condición más larga es la
que causa tu habilidad de ataque.

### Mods que dependen de tu estado

Los mods que dependen de tu estado solo cuentan mientras se cumple. "Por
encima" o "por debajo de la mitad de la salud" es estricto: justo a la mitad,
ninguno cuenta. Cuando termina un máximo aumentado, se pierde la salud o la
energía que supere el nuevo máximo.

| Mod                                                | Hueco, sirve para            | Qué hace                                                             |
| -------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| "Strength and Honor"                               | inscripción, marcial         | +15% de daño de arma por encima de la mitad de la salud              |
| "Guided by Fate", "Dance with Death"               | inscripción, marcial         | +15% de daño de arma encantado, en una postura                       |
| "Too Much Information"                             | inscripción, marcial         | +15% de daño de arma contra un enemigo con maleficio                 |
| "Vengeance is Mine"                                | inscripción, marcial         | +20% de daño de arma por debajo de la mitad de la salud              |
| "Don't Fear the Reaper"                            | inscripción, marcial         | +20% de daño de arma con un maleficio                                |
| "To the Pain!"                                     | inscripción, marcial         | +15% de daño de arma; -10 de armadura al atacar                      |
| "Brawn over Brains"                                | inscripción, marcial         | +15% de daño de arma; -5 de energía                                  |
| "Hale and Hearty", "Have Faith"                    | inscripción, cualquier arma  | +5 de energía por encima de la mitad de la salud, encantado          |
| "Don't call it a comeback!", "I am Sorrow."        | inscripción, cualquier arma  | +7 de energía por debajo de la mitad de la salud, con un maleficio   |
| of Devotion, of Endurance                          | sufijo, Staff, Shield, Focus | +45 de salud encantado, en una postura                               |
| of Valor                                           | sufijo, Staff, Shield, Focus | +60 de salud con un maleficio                                        |
| "Luck of the Draw"                                 | inscripción, Shield o Focus  | 20% de probabilidad de que un golpe físico haga 5 menos              |
| "Sheltered by Faith", "Run For Your Life!"         | inscripción, Shield o Focus  | los golpes físicos hacen 2 menos encantado, en una postura           |
| "Nothing to Fear"                                  | inscripción, Shield o Focus  | los golpes físicos hacen 3 menos con un maleficio                    |
| "Hail to the King", "Faith is My Shield"           | inscripción, Focus           | +5 de armadura por encima de la mitad de la salud, encantado         |
| "Might makes Right", "Knowing is Half the Battle." | inscripción, Focus           | +5 de armadura al atacar, al lanzar un hechizo                       |
| "Man for All Seasons", "Survival of the Fittest"   | inscripción, Focus           | +5 de armadura contra daño elemental, físico                         |
| "Ignorance is Bliss", "Life is Pain"               | inscripción, Focus           | +5 de armadura; -5 de energía, -20 de salud                          |
| "Down But Not Out", "Be Just and Fear Not"         | inscripción, Focus           | +10 de armadura por debajo de la mitad de la salud, con un maleficio |

El daño de arma es la tirada propia del arma: no aumenta el daño adicional
de una habilidad de ataque.

### Mods de lanzador

Los mods de lanzador solo afectan a los hechizos, cada uno con su propia
probabilidad al usar uno. "El atributo del objeto" es el atributo para el que
se hizo el Staff, la Wand o el Focus. Dos mods de reducir a la mitad que
salen a la vez solo reducen a la mitad una vez.

| Mod                         | Hueco, sirve para           | Qué hace                                                                                     |
| --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Adept                       | prefijo, Staff              | 20% de probabilidad de reducir a la mitad el lanzamiento de hechizos del atributo del objeto |
| Swift                       | prefijo, Staff              | 10% de probabilidad de reducir a la mitad el lanzamiento de cualquier hechizo                |
| of Aptitude                 | sufijo, Focus               | 20% de probabilidad de reducir a la mitad el lanzamiento de hechizos del atributo del objeto |
| of Swiftness                | sufijo, Focus               | 10% de probabilidad de reducir a la mitad el lanzamiento de cualquier hechizo                |
| "Aptitude not Attitude"     | inscripción, Staff o Wand   | 20% de probabilidad de reducir a la mitad el lanzamiento de hechizos del atributo del objeto |
| "Don't think twice"         | inscripción, Staff o Wand   | 10% de probabilidad de reducir a la mitad el lanzamiento de cualquier hechizo                |
| of Memory                   | sufijo, Wand                | 20% de probabilidad de reducir a la mitad la recarga de hechizos del atributo del objeto     |
| of Quickening               | sufijo, Wand                | 10% de probabilidad de reducir a la mitad la recarga de cualquier hechizo                    |
| "Let the Memory Live Again" | inscripción, Staff o Wand   | 10% de probabilidad de reducir a la mitad la recarga de cualquier hechizo                    |
| "Forget Me Not"             | inscripción, Focus          | 20% de probabilidad de reducir a la mitad la recarga de hechizos del atributo del objeto     |
| "Serenity Now"              | inscripción, Focus          | 10% de probabilidad de reducir a la mitad la recarga de cualquier hechizo                    |
| of Mastery                  | sufijo, Staff               | 20% de probabilidad de que el atributo del objeto sea +1 para un hechizo                     |
| "Master of My Domain"       | inscripción, Shield o Focus | 20% de probabilidad de que el atributo del objeto sea +1 para un hechizo                     |
| of Enchanting               | sufijo, marcial o Staff     | los encantamientos que lanzas duran un 20% más                                               |

## Armadura

La armadura son cinco piezas: cabeza, pecho, manos, piernas y pies. Cada
pieza tiene dos huecos de mejora:

- una **insignia**, un pequeño extra en esa pieza: más armadura contra daño
  físico, por ejemplo, o al atacar;
- una **runa**.

Tu **casco** da +1 a un atributo que elijas.

En el editor, la armadura es una figura. Haz clic en una pieza numerada, o
en su fila al lado, para elegir su insignia y su runa; cada opción dice qué
hace en esa pieza. **Aplicar insignia a todas (5)** pone la que elegiste en
todas las piezas. La figura muestra la insignia y la runa de cada pieza, y
sostiene las armas del set que estás viendo, con sus mods.

## Runas

| Runa                                   | Qué da                                      |
| -------------------------------------- | ------------------------------------------- |
| Runa de atributo Minor                 | +1 a un atributo                            |
| Runa de atributo Major                 | +2 a un atributo, -35 de salud              |
| Runa de atributo Superior              | +3 a un atributo, -75 de salud              |
| Vigor                                  | más salud (+30, +41 o +50)                  |
| Vitae                                  | +10 de salud                                |
| Attunement                             | más energía (+3, +6 o +9)                   |
| Clarity, Purity, Recovery, Restoration | dos condiciones duran un 20% menos cada una |
| Absorption (Warrior)                   | menos daño físico de cada golpe             |

La runa de una pieza se elige en el mismo sitio que su insignia: haz clic en
la pieza de la figura.

El editor lo suma todo por ti: salud, energía, armadura y daño, tal como los
tiene tu primer set de armas.
