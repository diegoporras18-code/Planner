# Planner

Tablero de proyectos tipo Monday: clientes, estados, presupuesto, margen Fuse y tareas.

## Cómo abrirlo

No necesita instalación ni servidor: abre `index.html` en el navegador.
(Opcional: `python3 -m http.server` y entra a http://localhost:8000.)

Los datos se guardan automáticamente en el navegador (`localStorage`). Usa **Exportar** para descargar una copia en JSON e **Importar** para restaurarla o pasarla a otro equipo.

## Qué hace

- **Proyectos**: tablero agrupado por estado (No ha empezado, En propuesta, En ejecución, En pausa, Listo). Cada celda se edita en línea; el estado se cambia con un clic.
- **Margen Fuse**: escribe el presupuesto (`190000000`, `190.000.000` o `190 millones`) y el % de margen; el valor en $ se calcula solo.
- **Tareas**: abre un proyecto para ver su resumen, estado, margen y tareas (Pendiente, En desarrollo, Listo).
- **Organizar**: buscar, filtrar por estado, ordenar (manual, nombre, cliente, presupuesto, margen, actualización) y arrastrar filas para reordenarlas o moverlas de estado.
- **Resumen general**: totales de presupuesto y margen, distribución por estado, totales por cliente y todos los próximos pasos.
- Borrar con opción de deshacer, tema claro/oscuro, vista adaptada a móvil.

Atajos: `N` nuevo proyecto · `/` buscar · `Esc` cerrar panel.
