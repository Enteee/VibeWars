var e=`# Habilidades y builds

Una **build** es lo que un personaje lleva a la lucha: dos profesiones, ocho
habilidades y los puntos de atributo que las respaldan. Abre una con
**Editar** en el menú principal, o con **Nuevo personaje**.

## Profesiones

Hay diez: Warrior, Ranger, Monk, Necromancer, Mesmer, Elementalist, Assassin,
Ritualist, Paragon y Dervish. Tu profesión **principal** es lo que eres: sus
habilidades y su **atributo principal** (marcado con ★), que solo tiene la
principal. Tu **secundaria** te presta sus habilidades, pero no su atributo
principal.

## La barra de habilidades

La barra tiene **ocho huecos**. Solo cabe una habilidad de **élite** (marco
dorado) por barra: si equipas una segunda, sustituye a la primera. Pulsa
**×** en un hueco para vaciarlo.

Los **encantamientos flash** (Dervish) son instantáneos: usar uno no
interrumpe tu golpe ni tu paso, así que puedes intercalarlos entre golpes.
Cada uno desactiva tus otros encantamientos flash durante 1 segundo.

Las **formas** (los cinco Avatares de Dervish: Balthazar, Dwayna, Grenth,
Lyssa y Melandru) te transforman durante más de un minuto. Una forma no es un
encantamiento, así que nadie puede quitártela, y solo puedes estar en una a la
vez. Usar una la desactiva durante 45 segundos. Cuando termina una forma,
paras lo que hacías: tu ataque, tu caminata y cualquier habilidad que
estuvieras activando. Pulsa otra vez una tecla de movimiento para seguir
caminando.

**Algunos disparos desactivan tus otros ataques.** Focused Shot y Needling
Shot vuelan más rápido de lo que debería una flecha, pero cada uno que acierta
desactiva tus otras habilidades de ataque unos segundos. Los hechizos no se
ven afectados.

## Atributos

Tienes **200 puntos** para gastar. Cada rango de un atributo cuesta más que
el anterior, hasta el rango 12; la fila muestra cuánto cuesta el siguiente.
Doce, doce y tres lo gastan todo. Las runas y el casco pueden añadir hasta
cuatro rangos más; consulta [Equipo](equipment.md). Subir el atributo que usa
una habilidad la hace más fuerte: los números que crecen con el atributo se
muestran en verde y negrita, con tus rangos actuales, incluidos runas y casco.

En combate tus rangos pueden cambiar un tiempo. Weakness quita uno de cada
atributo. Algunos maleficios ponen a 0 los atributos de un enemigo, y Master
of Magic pone a 13 los tuyos elementales: un rango fijado así anula por igual
runas y Weakness. Signet of Illusions hace que tus próximos hechizos de otros
atributos usen tu rango de Illusion Magic. Algunas habilidades suben tus
atributos un tiempo o para tus próximos hechizos, como Glyph of Elemental Power
y Ritual Lord, incluso uno que dejaste en 0; un rango fijado, como el de Master
of Magic, se impone a ese aumento.

## Ecos

Los **ecos** de un Paragon son mejoras largas sobre un aliado. Un **estribillo**
se renueva a su duración completa, y un **final** hace efecto, cada vez que
termina un cántico o un grito sobre ese aliado. Un cántico o grito que se
vuelve a aplicar antes de terminar no ha terminado. Nada elimina un eco:
termina cuando se agota o cuando muere su portador. La mayoría no puede
dirigirse a un espíritu.

## Habilidades que se convierten en otra

Algunas habilidades de Mesmer ponen otra habilidad en su propio hueco durante
un tiempo. Arcane Echo y Echo copian la siguiente habilidad que uses.
**Inspired Enchantment** e **Inspired Hex** se convierten en la habilidad que
lanzó el encantamiento o maleficio que eliminaron, durante 20 segundos.
**Arcane Thievery** se convierte en el hechizo que desactivó a tu enemigo,
mientras dure la desactivación. La copia tiene su propia recarga. Cuando
termina, la habilidad original vuelve y empieza su propia recarga, y un
lanzamiento de la copia aún en curso falla. Un estado puesto por un espíritu o
por otro estado no se puede copiar, aunque eliminarlo sigue dándote la energía.

## Pozos y glifos

Los **pozos** de un Necromancer aprovechan el cadáver más cercano. Si no hay
ninguno cerca, un pozo sacrifica en su lugar el 66% de tu salud y aparece donde
estás.

Los **glifos** de un Elementalist cambian tu próximo hechizo: no se puede
interrumpir, se lanza al instante, se recarga enseguida o cuesta menos. Un
glifo nuevo sustituye al que tenías.

## Intervenciones

Una habilidad que responde a "la próxima vez que el daño baje tu salud por
debajo del N%" responde a cualquier golpe o robo de vida que te deje vivo y por
debajo de ese límite, aunque ya estuvieras por debajo antes del golpe, y nunca
a la salud que sacrificas o pierdes por degeneración. La protección contra daño
mortal, como Judge's Intervention, anula todo el golpe mortal: sin daño, sin
muerte. Faithful Intervention e Illusion of Weakness no tienen duración: duran
hasta que el daño, una eliminación o la muerte las terminan, y te curan
mientras tanto.

## La biblioteca

La biblioteca de habilidades muestra todas las habilidades que pueden usar tus
dos profesiones, agrupadas por atributo. Busca nombres y texto junto al botón
**Filtros**. Filtros abre una ventana donde eliges tipos de habilidad o **Solo
élite** para acotar la lista; **Listo**, Esc o un clic fuera la cierran. El
botón cuenta los activos (**Filtros · 2**), y cada filtro aparece a su lado
como etiqueta: haz clic en una etiqueta para quitar ese filtro, o en **clear**
para quitarlos todos. Las habilidades de otras profesiones esperan, plegadas,
en **Otras profesiones**.

Los grupos de atributos empiezan plegados: haz clic en el nombre de un grupo
para abrirlo. Una búsqueda o un filtro abre cada grupo en el que encuentra algo.

Junto al editor, el **campo de entrenamiento** te deja probar tu barra con
objetivos de práctica antes de una partida. Su registro muestra cada habilidad
que usáis tú o un bot, la adrenalina que ganas y las habilidades que no
tuvieron efecto, con lo que estaban esperando. Algunos objetivos se mueven: en
**Moving targets** uno da vueltas, otro huye de ti y otro te persigue. Su
medidor cuenta como tuyos el daño y la curación de tus espíritus, esbirros y
mascota.

## Hechizos de objeto

Los **hechizos de objeto** de un Ritualist ponen las **cenizas** de un espíritu
en tus manos: una bonificación mientras las sostienes, y un **efecto al
soltar** cuando caen. Caen cuando se agotan, cuando mueres, cuando pulsas
**Soltar cenizas** sobre tu barra de salud, lanzas otro hechizo de objeto, usas
un paso de sombra, cambias de armas o coges una bandera o reliquia. Tienes las
manos ocupadas mientras las llevas: ni ataques ni habilidades de ataque, pero
caminas a velocidad normal y sigues lanzando hechizos. Nada elimina las
cenizas; todo final es una caída.

## Pasos de sombra

Un **paso de sombra** te mueve al instante, sin caminar. La mayoría te lleva a
tu objetivo; algunos te devuelven al sitio donde los lanzaste cuando terminan,
como Shadow of Haste y Shadow Walk. **Recall** te lleva a su aliado solo cuando
termina, y desactiva todas tus habilidades durante 3 segundos. **Swap**
intercambia tu sitio con el de uno de los espíritus o esbirros de tu bando.

## Compartir builds

En el menú **⋯** del editor, **Compartir** da tu build como una línea de texto,
y **Compartir como código GW1** como un código de plantilla de GW1. Pulsa
**Copiar** y envíala.

Para cargar una, elige **Cargar código GW1** en **⋯**, pega el código y pulsa
**Cargar**. Si no se puede cargar, dice por qué bajo el campo. Como atajo,
también puedes pegar un código en cualquier parte del editor que no sea un
campo de texto. Los dos tipos de código funcionan en ambos sitios. Una
habilidad de GW1 que VibeWars aún no tiene llega como un hueco vacío. La build
es tuya cuando pulsas **Guardar**.

**Guardar** conserva tu build y te devuelve a donde estabas. **Esc** sale sin
guardar, y pregunta antes si has cambiado algo. **Compartir**, **Cargar código
GW1**, **Duplicar** y **Eliminar** están en **⋯**.

Un código de equipo se pega en **Creador de equipos**.

## Builds de equipo

Una **build de equipo** es un equipo de personajes propios, hecho en **Creador
de equipos** y separado de tus personajes. Cada una es una carta ahí, y solo
ahí: **Nueva build** crea una, y un clic en una carta, o su **Editar**, la
abre. Propones una en la [Sala de equipo](modes.md#sala-de-equipo).

Cada build de equipo tiene un tamaño, 2v2, 4v4 u 8v8 (no hay builds de equipo
de 1v1): el **Tamaño del equipo** de la barra lateral. Creador de equipos
muestra las builds de equipo del tamaño elegido ahí, y **Nueva build** crea una
de ese tamaño. El tamaño de una build de equipo es fijo: su editor lo muestra
bloqueado, y para jugar otro tamaño haces otra build de equipo. Un equipo pegado
conserva su tamaño, y la barra lateral cambia a él.

Una build de equipo siempre tiene tantos miembros como su tamaño: una nueva
empieza con un personaje en blanco en cada puesto. Nunca añades ni quitas un
miembro, lo sustituyes. Cada fila muestra el personaje del miembro con las
armas que lleva, un punto por cada set de armas cuando tiene más de uno, su
salud y energía máximas y sus ocho habilidades; arrastra una fila por su ⠿ para
reordenarla. El panel de la derecha es la biblioteca del Creador de personajes,
con una pestaña **Mis personajes** antes de **Habilidades** y **Equipo**. En
**Mis personajes**, arrastra uno de tus personajes sobre un miembro para que
ese miembro sea una copia. Una copia es propia del equipo: cambiarla, o cambiar
el personaje del que viene, deja al otro como estaba. En **Habilidades**, la
biblioteca muestra las habilidades del último miembro en el que hiciste clic;
arrastra una al hueco de cualquier miembro para equiparla ahí. En la propia
barra de ese miembro, una habilidad que ya está se mueve al hueco. Si un miembro
no puede aceptarla, por ser una habilidad de otra profesión o estar ya en la
barra de otro miembro, se marca con un hueco discontinuo y el motivo, y no pasa
nada. Arrastra una habilidad que ya está en la barra de un miembro a cualquier
hueco para moverla ahí, intercambiando su sitio con la que haya; mantén
**Shift** al soltarla sobre otro miembro para copiarla. Una barra sigue teniendo
una sola élite y ninguna habilidad repetida, así que lo que rompa eso se rechaza
igual. Las habilidades de cada miembro se muestran como iconos; pasa el ratón
sobre uno para ver sus detalles, y haz clic para encontrar todas sus copias en
el equipo. El **▼** de un miembro lo abre allí mismo (**▲** lo cierra), bajo su
fila: sus profesiones, nombre, rangos de atributo, barra de habilidades y equipo
se cambian ahí mismo. Como en el Creador de personajes, haz clic en uno de los
huecos de su barra y **Equipar** pone una habilidad en ese hueco; si no eliges
ninguno, va al primero vacío. **Equipo** tiene las armas y manos secundarias del
miembro abierto, y solo aparece con uno abierto: haz clic en una para equiparla,
o arrástrala a sus manos. Solo hay un miembro abierto a la vez; **Esc** lo
cierra. Una nueva profesión descarta las habilidades y rangos que no puede usar,
con un **Deshacer**. Pulsa el nombre de un miembro, o **Abrir en la pantalla de
personaje**, para editarlo en el editor de builds; su **Guardar** lo devuelve al
equipo, y el **Guardar** del propio equipo lo conserva todo y te lleva de vuelta
a Creador de equipos. **Esc** sale sin guardar, y pregunta antes. **Compartir**,
**Duplicar** y **Eliminar** del equipo están en **⋯**.
Puedes guardar un equipo en cualquier momento, aunque tenga problemas, pero solo
un equipo sin problemas se puede proponer en una Sala de equipo: una carta dice
**No jugable** y por qué, y un equipo sin nombre aparece como **Equipo sin
nombre**. Tu primer inicio te da un equipo ya hecho del tamaño elegido, 4v4 si
no lo cambiaste, marcado **Aleatorio**: su **Cambiar** pone otro, y **Clonar**
te da una copia para editar.
`;export{e as default};
//# sourceMappingURL=skills-and-builds-R6G7eiBN.js.map