# VCM2
Un album de recuerdos

## Cómo ejecutar
1. Desde la raíz del repositorio (`/workspace/VCM2`), levanta un servidor estático.
   - Opción Python: `python3 -m http.server 8000`
   - Opción VSCode: Live Server apuntando a la raíz del repo.
2. Abre la app en el navegador con `http://localhost:8000/index.html` (ajusta el puerto si usas otro).
3. **No uses `file://` ni abras `index.html` con doble clic**, porque las peticiones a recursos como `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson` pueden fallar por políticas del navegador.
4. Verifica en DevTools > Network que `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson` responde `200`.
