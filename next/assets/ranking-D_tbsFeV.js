var e=`# Clasificación

## Qué es clasificatorio

Toda partida de la cola sin bots es clasificatoria: Arena aleatoria y
Arena por equipos. Una Partida alojada, el Entrenamiento y cualquier
partida con un bot no son clasificatorias. No hay ningún interruptor ni
una cola aparte. Una partida clasificatoria nunca rellena un puesto
vacío con un bot.

## Tu puntuación

Tu puntuación pertenece a tu clave de jugador, la que guarda este
navegador. Todos los personajes que juegues con ella comparten esa
única puntuación.

Las colas clasificatorias emparejan a jugadores de puntuación parecida
y los reparten en equipos de puntuación media parecida. La búsqueda
empieza a 100 puntos de tu puntuación y se amplía 10 puntos por cada
segundo de espera, hasta 600, así que nadie espera para siempre.
Mientras esperas, la cola muestra tu puntuación.

Tus primeras 10 partidas puntuadas son provisionales: la cola dice
**Provisional (3/10 partidas)** y aún no tienes puesto. Después, el
menú principal muestra tu puesto. Las puntuaciones decaen: cada día sin
una partida puntuada hace la tuya menos segura, y la clasificación
ordena por un valor prudente, así que si dejas de jugar tu puesto baja
en semanas.

En cuanto la clasificación tiene 20 jugadores asentados, una partida
clasificatoria solo cuenta si al menos un jugador en ella está asentado
(10 o más partidas puntuadas): una partida solo entre jugadores nuevos
no se puntúa. Juega con alguien asentado y tus partidas cuentan.

El botón **Clasificación** de la barra superior muestra los 100 mejores
por puesto, nombre y puntuación, con tu fila resaltada.

El rango de héroe (★) no es esta puntuación: viene de la fama, mira
[Ascenso de los Héroes](modes.md#ascenso-de-los-héroes).

## Inicio de la partida

Cuando se encuentra una partida clasificatoria, todos la confirman en
15 segundos, y la pantalla dice **Confirmando partida
clasificatoria…**. Si alguien no confirma, la partida se cancela y todos
vuelven a la cola.

## Final de la partida

Al final, todos firman el resultado en 30 segundos. No firmar cuenta
como abandonar, y abandonar una partida clasificatoria cuenta como
derrota, también para el anfitrión. El botón de salir lo dice. Un
resultado cuenta solo si firman más de la mitad de los puestos.

## Qué se publica

El recibo de la partida se publica en relés públicos de Nostr. Contiene
la clave pública y el nombre del personaje de cada jugador (un jugador
sin personaje figura como starter) y quién jugó contra quién. Cualquiera
puede leerlo y no se puede retirar. Las partidas no clasificatorias no
publican nada.

## Cuándo se actualiza

Tu puntuación cambia en menos de una hora, y la clasificación con ella.
`;export{e as default};
//# sourceMappingURL=ranking-D_tbsFeV.js.map