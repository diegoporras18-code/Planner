# Planner

Tablero de proyectos tipo Monday: clientes, estados, presupuesto, margen Fuse y tareas.

## Cómo abrirlo

No necesita instalación ni servidor: abre `index.html` en el navegador.
(Opcional: `python3 -m http.server` y entra a http://localhost:8000.)

Los datos se guardan automáticamente en el navegador (`localStorage`). Usa **Exportar** para descargar una copia en JSON e **Importar** para restaurarla o pasarla a otro equipo.

## Qué hace

- **Proyectos**: tablero agrupado por estado (No ha empezado, En propuesta, En ejecución, En pausa, Listo). Cada celda se edita en línea; el estado se cambia con un clic.
- **Margen Fuse**: escribe el valor del proyecto (`190000000`, `190.000.000` o `190 millones`) y el % de margen; el margen en $ se calcula solo.
- **Fechas**: cada proyecto tiene su fecha y cada tarea la suya. Filtra por fecha (pasadas sin terminar, esta semana, este mes, próximos 30 días, sin fecha o un rango personalizado); un proyecto aparece si su fecha o la de alguna de sus tareas cae en el rango.
- **Tareas**: abre un proyecto para ver su resumen, estado, margen y tareas (Pendiente, En desarrollo, Listo).
- **Organizar**: buscar, filtrar por estado, ordenar (manual, nombre, cliente, valor, margen, fecha, actualización) y arrastrar filas para reordenarlas o moverlas de estado.
- **Resumen general**: totales de valor y margen (respetando el filtro de fecha), distribución por estado, totales por cliente y todos los próximos pasos.
- Borrar con opción de deshacer, tema claro/oscuro, vista adaptada a móvil.

Atajos: `N` nuevo proyecto · `/` buscar · `Esc` cerrar panel.
