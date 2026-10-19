# Pádel Arena

Juego de pádel 3D 2 vs 2 para navegador (Three.js r128 desde CDN, sin instalación).

**Cómo jugar:** abrí `index.html` en el navegador (doble clic). Necesita internet para cargar Three.js y la tipografía.

## Modos
- **Exhibición:** partido rápido. 1 jugador, 2 jugadores juntos (vs IA) o 2 jugadores enfrentados en el mismo teclado o con mandos. Elegís la pareja rival.
- **Torneo:** cuadro de 8 parejas (cuartos, semifinal y final) en tres niveles.
- **Carrera:** creás tu jugador, repartís atributos (potencia, control, velocidad, reflejos, resistencia), elegís compañero, jugás torneos Challenger / Open / Master / Finals y subís en el ranking. Se guarda en el navegador.
- **Entrenamiento:** máquina lanzapelotas con 4 ejercicios (fondo, salida de pared, volea, bandeja y remate), dianas y récords.
- **Online:** conexión directa entre dos navegadores intercambiando dos códigos (juntos vs IA o enfrentados). Funciona mejor en redes domésticas; algunas redes bloquean la conexión directa.

## Controles
**Jugador 1:** `WASD` (y flechas si jugás solo) · `Espacio`/`J` golpe y saque · `L` cortado · `K` globo · `Q` ¡Tuya! · `E` ¡Mía! · `T` táctica del compañero
**Jugador 2:** flechas · `.`/`Enter` golpe · `,` cortado · `-` globo (o `1` `2` `3` del teclado numérico) · `8` ¡Tuya! · `9` ¡Mía! · `0` táctica
**Mandos:** stick · A golpe · X cortado · Y/B globo · LB ¡Tuya! · RB ¡Mía! · SELECT táctica · START pausa
**General:** `C` cámara · `P`/`Esc` pausa · `M` sonido. En móvil: joystick y botones en pantalla.

Al golpear: izquierda/derecha dirige, hacia la red = drive liftado, hacia atrás = dejada. Con la pelota alta: golpe = remate, cortado = bandeja, globo = víbora, hacia la red + remate cerca de la red con buen timing = **por 3**.

## Sistemas de juego
- **Medidor de timing** (asistido / normal / pro): el golpe sale 0,12 s después de pulsar; PERFECTO da más precisión y potencia.
- **Efectos:** liftado (estela naranja), cortado (estela celeste) y lateral (víbora), con su efecto en el bote y en el cristal.
- **Salida por 3 / por 4:** si la pelota sale de la pista tras botar, se puede correr afuera a buscarla.
- **Rivales con estilo** (pegador, defensor, voleador, completo) y **punto débil** oculto; el juego da pistas cuando lo descubrís.
- **Cansancio:** barra de energía; cansado corrés más lento y fallás más.
- **Estadísticas** al final del partido y mapa de dónde picaron tus golpes.
- **Repeticiones** de los puntos destacados, cámara dinámica, animaciones (paso lateral, revés a dos manos, salto en el remate, celebraciones), locutor por voz y público que reacciona.
- **Personalización:** camiseta, pala, color de pista y escenario (estadio de noche o aire libre de día).

## Gráficos
- **Jugadores articulados:** cadera, rodillas, columna, hombros, codos y cabeza que sigue la pelota. Camisetas con diseño y número, zapatillas, medias, muñequera y peinados variados (gorra, vincha, pelo largo…). Postura de espera flexionada, carrera con rodillas, paso lateral, giro de torso en los golpes, salto en el remate y festejos.
- **Contacto real pala-pelota:** el jugador arma la pala atrás mientras viene la pelota, da un paso de ajuste para quedar a la distancia justa, se agacha en las bajas y salta en los remates; en el impacto el brazo y el codo se orientan (cinemática inversa) para que la pala esté justo en la pelota. La IA empieza el swing 0,12 s antes del impacto, igual que vos al pulsar.
- **Pala de pádel real:** cara de carbono con diseño, agujeros pasantes, marco brillante, corazón abierto, cubregrip y cordón.
- **Pelota** con textura de fieltro y costura, que gira según su efecto.
- **Pista:** césped sintético con fibras, relieve, arena y desgaste; cristales con reflejos y herrajes; red con caída en el centro; reja de malla soldada; sombras al pie de las paredes.
- **Estadio:** butacas, público que se levanta y festeja, carteles LED animados, banquillos, silla del juez, torres de iluminación con destellos y cielo de noche o de día.
- **Calidad gráfica** (Ajustes): alta, media o baja. Cambia la resolución, las sombras, los reflejos y la cantidad de público.
- Vista rápida sin jugar: `index.html#demo`, `#demo-cerca` (cámara cercana) o `#demo-dia`. La tecla `C` también tiene una cámara cercana.

## Realismo
- **Física:** resistencia del aire y efecto Magnus según la velocidad (el liftado cae, el cortado flota); el apuntado se corrige simulando el tiro. La pelota patina en las líneas, bota distinto en la arena junto a las paredes y sale rara si pega en un perfil metálico.
- **Imagen de TV** (calidad alta/media): brillo en focos y pelota, corrección de color, viñeta y grano; desenfoque de fondo en la cámara cercana y en las repeticiones; estela de movimiento en los remates. Si las librerías de efectos no cargan (sin internet), el juego se ve igual que antes.
- **Cámara de transmisión** que acompaña la pelota y se acerca cuando el juego está en el fondo; repeticiones con dos ángulos y **cámara superlenta** en cada golpe.
- **Gráficos de TV:** velocidad del saque y del remate en km/h, y rótulo con el nombre del que hizo el golpe ganador.
- **Efectos:** marca y polvo de arena donde pica la pelota, sombras de contacto bajo los pies, estela de la pala en los golpes.
- **Jugadores:** juegan de pared (esperan a que la pelota rebote en el cristal y le pegan cuando sale, si llegan a tiempo), split step (saltito) cuando pega el rival, suben juntos a la red después de un globo, chocan las palas al ganar el punto, el sacador bota la pelota con la mano.
- **Sonido:** eco del estadio y del cristal, golpe en el centro de la pala o en el marco, rebote metálico en los perfiles, pasos y chirridos de zapatillas, "¡uy!" del público en los errores, aplausos según el punto, megafonía al empezar y música en los menús.

## Modelos 3D reales (opcional)
En **Personalizar → Modelos 3D reales** podés cargar personajes humanos descargados (FBX o GLB con esqueleto tipo Mixamo). Se animan con los movimientos del juego (el juego adapta su propio esqueleto al del personaje), así que no hacen falta animaciones.
1. Entrá a mixamo.com con una cuenta gratuita de Adobe.
2. Pestaña **Characters** → elegí un personaje → **Download** → formato **FBX Binary**, pose **T-pose**.
3. En el juego: **Cargar personaje** y elegí el archivo. Podés cargar hasta 4 (uno por jugador). Quedan guardados en el navegador.
También hay un botón para probar con un maniquí de ejemplo de three.js (se descarga de internet).

**Animaciones capturadas (opcional):** en la misma pantalla, **Cargar animaciones** acepta FBX de Mixamo descargados con tu personaje (*Without Skin*, 30 fps, *In Place* en las de correr). El juego reconoce cada una por el nombre del archivo:
`Breathing Idle` (espera), `Running` (correr), `Running Backward` (retroceder), `Left Strafe` / `Right Strafe` (carrera lateral rápida), `Victory` (festejo) y `Defeated` (lamento).
Las piernas y la cadera usan la captura al correr y todo el cuerpo al festejar; los brazos, el torso y los golpes siguen siendo los del juego, para que la pala toque la pelota. El paso lateral corto es el del juego (en pádel no se cruzan las piernas).
El personaje se adapta al esqueleto del juego: brazos y piernas toman el largo del juego (así la mano queda exactamente en la empuñadura y los pies en el piso), los dedos se cierran sobre el mango y se soportan los FBX de Mixamo que traen varios esqueletos.

## Archivos
- `index.html` — pantallas y HUD · `css/style.css` — estilos
- `js/util.js` constantes, datos y guardado · `js/audio.js` sonido y locutor · `js/models.js` jugadores, pala y pelota · `js/scene.js` pista, estadio, luces y reflejos
- `js/physics.js` física de la pelota · `js/game.js` reglas, IA y golpes · `js/animation.js` contacto pala-pelota y animación
- `js/render.js` cámaras y repeticiones · `js/hud.js` marcador y pantallas · `js/effects.js` efectos y rótulos de TV · `js/post.js` imagen de TV · `js/models3d.js` modelos 3D reales · `js/mocap.js` animaciones capturadas
- `js/modes.js` exhibición, torneo, carrera y entrenamiento · `js/net.js` online · `js/ui.js` menús, controles y bucle principal
