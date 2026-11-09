# Ruta Norte

PWA de asistente de viaje para móvil (HTML, CSS y JS, sin backend). Funciona sin conexión y se instala en la pantalla de inicio.

- **Hoy**: siguiente evento con cuenta atrás y línea de tiempo del día.
- **Plan**: itinerario editable; recalcula márgenes (check-out, transbordos, llegada al alojamiento) y avisa de conflictos. Exportar e importar JSON.
- **Ciudad**: qué ver, dónde comer, historia y curiosidades.
- **Trayectos**: horarios y paisajes de cada tren, bus o vuelo con hora aproximada.
- **Billetes** y **Avisos**.

## Datos privados

Este repositorio solo contiene información general. Localizadores, PDF, alojamientos y horario de trabajo van en `viaje-privado.json`, que se genera en local y se importa desde el móvil (Billetes → Importar datos privados). Se guarda solo en el dispositivo (IndexedDB).

```
node tools/empaquetar-privado.js   # lee privado/datos.json y los PDF, crea viaje-privado.json
```

`privado/`, `billetes/`, `alojamientos/`, `VIAJE.md` y `viaje-privado.json` están en `.gitignore`.
