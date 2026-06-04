# SuperEliteG2

Aplicación web para administrar personajes y su galería multimedia.

## Ejecutar con guardado automático en `characters.json`

Para que al agregar, editar o eliminar personajes desde la página también se actualice el archivo `characters.json`, abre el proyecto con el servidor incluido:

```bash
node server.js
```

Luego entra en:

```text
http://localhost:3000
```

El navegador por sí solo no puede escribir archivos locales. Por eso `server.js` expone el endpoint `/api/characters`, sirve la página y guarda automáticamente el listado actualizado en `characters.json`.

## Notas

- Los personajes se cargan desde `characters.json`.
- Las altas, ediciones y eliminaciones de personajes se persisten en `characters.json` cuando la app está corriendo con `node server.js`.
- La multimedia continúa guardándose en el almacenamiento local del navegador.
