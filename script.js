const firebaseConfig = {
  apiKey: "AIzaSyB3KdarawI0Ch0HYOQo6LXkDP5Zclui0yI",
  authDomain: "carolandia-199a5.firebaseapp.com",
  databaseURL: "https://carolandia-199a5-default-rtdb.firebaseio.com",
  projectId: "carolandia-199a5",
  storageBucket: "carolandia-199a5.firebasestorage.app",
  messagingSenderId: "940168409879",
  appId: "1:940168409879:web:cde4e3bd76a934f4e47d52",
  measurementId: "G-HEDFE5BZ7X"
};
        lucide.createIcons();

        // BASES DE DATOS EN MEMORIA
        let paisesVisitados = {};
        let provinciasVisitadas = {}; 
        let destinosSonados = {}; 
        let estadoVistaRecuerdos = { modo: 'lista', idPais: null, idProvincia: null, submodo: 'ver', seccionNuevo: 'drive' };
        let estadoVistaSonados = { modo: 'lista', idPais: null };
        let estadoVistaItinerario = { modo: 'lista', idPais: null };
        let firebaseDb = null;
        let estadoInicialSincronizado = false;
        let ultimaHuellaSincronizada = "";
        let sincronizacionLocalEnCurso = false;
        let intervaloAutosave = null;
        let rutaEstadoFirebase = null;
        let estadoEdicionPortadaItinerario = {};

        const RUTA_ESTADO_COMPARTIDO = "nuestraHistoria/estadoCompartido";

        function obtenerRutaEstadoFirebase(uid = "") {
            return RUTA_ESTADO_COMPARTIDO;
        }
        const ESTADOS_PROVINCIAS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
        function obtenerEstadoActual() {
            return {
                paisesVisitados,
                provinciasVisitadas,
                destinosSonados,
                actualizadoEn: new Date().toISOString()
            };
        }

        function contarMemoriasDestino(destino) {
            if (!destino || typeof destino !== "object") return 0;

            const totalAlbumes = Array.isArray(destino?.albumes) ? destino.albumes.length : 0;
            const totalHistorias = Array.isArray(destino?.historias) ? destino.historias.length : 0;

            // Compatibilidad con datos guardados con nombres anteriores
            const totalDrives = Array.isArray(destino?.drives) ? destino.drives.length : 0;
            const totalNotas = Array.isArray(destino?.notas) ? destino.notas.length : 0;

            return totalAlbumes + totalHistorias + totalDrives + totalNotas;
        }

        function contarMemoriasPais(idPais) {
            const provinciasDelPais = provinciasVisitadas?.[idPais];
            let totalMemorias = 0;

            if (provinciasDelPais && typeof provinciasDelPais === "object") {
                Object.values(provinciasDelPais).forEach((provincia) => {
                    totalMemorias += contarMemoriasDestino(provincia);
                });
            }

            // Mantener compatibilidad con recuerdos guardados a nivel país
            const pais = paisesVisitados?.[idPais];
            return totalMemorias + contarMemoriasDestino(pais);
        }

        function serializarEstable(valor) {
            if (Array.isArray(valor)) {
                return valor.map(item => serializarEstable(item));
            }
            if (valor && typeof valor === "object") {
                return Object.keys(valor)
                    .sort()
                    .reduce((acumulado, clave) => {
                        acumulado[clave] = serializarEstable(valor[clave]);
                        return acumulado;
                    }, {});
            }
            return valor;
        }

        function calcularHuellaEstado(estado = obtenerEstadoActual()) {
            return JSON.stringify(serializarEstable({
                paisesVisitados: estado.paisesVisitados || {},
                provinciasVisitadas: estado.provinciasVisitadas || {},
                destinosSonados: estado.destinosSonados || {}
            }));
        }

        function aplicarEstadoRemoto(estado) {
            paisesVisitados = estado?.paisesVisitados || {};
            provinciasVisitadas = estado?.provinciasVisitadas || {};
            destinosSonados = estado?.destinosSonados || {};
            normalizarDestinosSonados();
            cargarMapa();

            const vistaRecuerdosActiva = document.getElementById('vista-vividas')?.classList.contains('pantalla-activa');
            const vistaSonadosActiva = document.getElementById('vista-por-vivir')?.classList.contains('pantalla-activa');

            if (vistaRecuerdosActiva) {
                if (estadoVistaRecuerdos.modo === 'detalle' && estadoVistaRecuerdos.idPais && paisesVisitados[estadoVistaRecuerdos.idPais]) {
                    const provinciaExiste = estadoVistaRecuerdos.idProvincia && provinciasVisitadas[estadoVistaRecuerdos.idPais]?.[estadoVistaRecuerdos.idProvincia];
                    if (estadoVistaRecuerdos.idProvincia && provinciaExiste) {
                        abrirAlbumDetalle(estadoVistaRecuerdos.idPais, estadoVistaRecuerdos.idProvincia, estadoVistaRecuerdos.submodo || 'ver');
                    } else {
                        abrirAlbum(estadoVistaRecuerdos.idPais);
                    }
                } else if (estadoVistaRecuerdos.modo === 'provincias' && estadoVistaRecuerdos.idPais && paisesVisitados[estadoVistaRecuerdos.idPais]) {
                    abrirAlbum(estadoVistaRecuerdos.idPais);
                } else {
                    renderizarPantallaRecuerdos();
                }
            }

            if (vistaSonadosActiva) {
                if (estadoVistaSonados.modo === 'detalle' && estadoVistaSonados.idPais && destinosSonados[estadoVistaSonados.idPais]) {
                    abrirPlanificador(estadoVistaSonados.idPais);
                } else {
                    renderizarPantallaSonados();
                }
            }
        }

        function slugDia(nombre = "") {
            return String(nombre || "")
                .toLowerCase()
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'dia';
        }

        function crearDia(numero = 1, nombre = '') {
            const numeroSeguro = Math.max(1, Number(numero) || 1);
            const nombreSeguro = (nombre || `Día ${numeroSeguro}`).trim() || `Día ${numeroSeguro}`;
            return {
                id: `dia-${numeroSeguro}-${slugDia(nombreSeguro)}`,
                numero: numeroSeguro,
                nombre: nombreSeguro,
                fecha: ''
            };
        }

        function normalizarDiasDestino(destino) {
            const diasOriginales = Array.isArray(destino.dias) ? destino.dias : [];
            const diasNormalizados = [];
            const idsUsados = new Set();

            diasOriginales.forEach((dia, index) => {
                const numero = Math.max(1, Number(dia?.numero) || (index + 1));
                const nombre = (dia?.nombre || `Día ${numero}`).trim() || `Día ${numero}`;
                let id = typeof dia?.id === 'string' ? dia.id.trim() : '';
                const fecha = esFechaActividadValida(dia?.fecha) ? dia.fecha : '';
                if (!id) id = `dia-${numero}-${slugDia(nombre)}`;
                while (idsUsados.has(id)) id = `${id}-${index + 1}`;
                idsUsados.add(id);
                diasNormalizados.push({ id, numero, nombre, fecha });
            });

            if (!diasNormalizados.length) {
                const base = crearDia(1, 'Llegada');
                diasNormalizados.push(base);
            }

            diasNormalizados.sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
            diasNormalizados.forEach((dia, index) => {
                dia.numero = index + 1;
                if (!dia.nombre) dia.nombre = `Día ${dia.numero}`;
                if (!esFechaActividadValida(dia.fecha)) dia.fecha = '';
            });

            return diasNormalizados;
        }

        function esFechaActividadValida(fecha = '') {
            return /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '').trim());
        }

        function generarRangoFechasISO(fechaInicio = '', fechaFin = '') {
            if (!esFechaActividadValida(fechaInicio) || !esFechaActividadValida(fechaFin)) return [];
            if (fechaInicio > fechaFin) return [];

            const fechas = [];
            let cursor = fechaInicio;
            while (cursor <= fechaFin) {
                fechas.push(cursor);
                cursor = sumarDiasAFechaISO(cursor, 1);
                if (!cursor) break;
            }
            return fechas;
        }

        function derivarDiasDesdeFechasItinerario(destino) {
            if (!destino || typeof destino !== 'object') {
                return {
                    dias: [crearDia(1, 'Día 1')],
                    diaPorFecha: new Map(),
                    fechaPorDiaId: new Map()
                };
            }

            const itinerario = Array.isArray(destino.itinerario) ? destino.itinerario : [];
            const fechasItinerario = [];

            itinerario.forEach((item) => {
                const fechaActividad = String(item?.fechaActividad || '').trim();
                if (esFechaActividadValida(fechaActividad)) fechasItinerario.push(fechaActividad);

                if (item?.tipo === 'hospedaje') {
                    const fechaCheckout = obtenerFechaCheckoutHospedaje(item, fechaActividad);
                    if (esFechaActividadValida(fechaCheckout)) {
                        item.fechaCheckout = fechaCheckout;
                        fechasItinerario.push(fechaCheckout);
                    }
                }
            });

            const fechasConActividad = Array.from(new Set(
                fechasItinerario.filter(esFechaActividadValida)
            )).sort((a, b) => a.localeCompare(b));

            if (!fechasConActividad.length) {
                const diasSinFechas = normalizarDiasDestino(destino);
                const diaPorFechaVacio = new Map();
                const fechaPorDiaIdVacio = new Map();
                destino.dias = diasSinFechas;
                return {
                    dias: diasSinFechas,
                    diaPorFecha: diaPorFechaVacio,
                    fechaPorDiaId: fechaPorDiaIdVacio
                };
            }

            const fechaInicio = fechasConActividad[0];
            const fechaFin = fechasConActividad[fechasConActividad.length - 1];
            const fechasUnicas = generarRangoFechasISO(fechaInicio, fechaFin);

            const diasPrevios = Array.isArray(destino.dias) ? normalizarDiasDestino(destino) : [];
            const diaPrevioPorFecha = new Map();
            diasPrevios.forEach((dia) => {
                if (esFechaActividadValida(dia?.fecha)) {
                    diaPrevioPorFecha.set(dia.fecha, dia);
                }
            });

            const dias = fechasUnicas.map((fecha, index) => {
                const diaPrevio = diaPrevioPorFecha.get(fecha);
                const diaBase = crearDia(index + 1, `Día ${index + 1}`);
                return {
                    ...diaBase,
                    id: diaPrevio?.id || diaBase.id,
                    nombre: (diaPrevio?.nombre || diaBase.nombre).trim() || diaBase.nombre,
                    fecha
                };
            });

            const diaPorFecha = new Map();
            const fechaPorDiaId = new Map();

            fechasUnicas.forEach((fecha, index) => {
                const dia = dias[index];
                diaPorFecha.set(fecha, dia);
                fechaPorDiaId.set(dia.id, fecha);
            });

            const diaFallback = dias[0];
            itinerario.forEach(item => {
                if (!item || typeof item !== 'object') return;
                const fecha = String(item.fechaActividad || '').trim();
                if (esFechaActividadValida(fecha) && diaPorFecha.has(fecha)) {
                    item.diaId = diaPorFecha.get(fecha).id;
                } else {
                    item.fechaActividad = '';
                    item.diaId = diaFallback.id;
                }
            });

            destino.dias = dias;
            return { dias, diaPorFecha, fechaPorDiaId };
        }

        function normalizarDestinosSonados() {
            Object.keys(destinosSonados || {}).forEach((idPais) => {
                const destino = destinosSonados[idPais];
                if (!destino || typeof destino !== "object") {
                    delete destinosSonados[idPais];
                    return;
                }

                destino.nombre = destino.nombre || destino.destinoFinal || "Destino";
                destino.destinoFinal = destino.destinoFinal || destino.nombre;
                destino.escalas = Array.isArray(destino.escalas) ? destino.escalas : [];
                destino.escalasCiudades = Array.isArray(destino.escalasCiudades) ? destino.escalasCiudades : [];
                destino.itinerario = Array.isArray(destino.itinerario) ? destino.itinerario : [];
                destino.ciudadDestinoFinal = destino.ciudadDestinoFinal || "";
                destino.portadaUrl = destino.portadaUrl || "";
                derivarDiasDesdeFechasItinerario(destino);

                destino.itinerario.forEach(item => {
                    asegurarDiaIdEnItem(destino, item);
                    if (item && item.diaId && Object.prototype.hasOwnProperty.call(item, 'dia')) {
                        delete item.dia;
                    }
                });
            });
        }

        function asegurarDiaIdEnItem(destino, item) {
            if (!destino || !item || typeof item !== 'object') return;

            if (!Array.isArray(destino.dias) || !destino.dias.length) {
                destino.dias = [crearDia(1, 'Llegada')];
            }

            const diaPorId = new Map(destino.dias.map(dia => [dia.id, dia]));
            if (typeof item.diaId === 'string' && diaPorId.has(item.diaId)) {
                return;
            }

            const diaDesdeTexto = normalizarDiaItinerario(item.dia || '').orden;
            if (Number.isFinite(diaDesdeTexto) && diaDesdeTexto > 0) {
                const encontrado = destino.dias.find(dia => dia.numero === diaDesdeTexto);
                if (encontrado) {
                    item.diaId = encontrado.id;
                    return;
                }
            }

            const primerDia = destino.dias[0] || crearDia(1, 'Llegada');
            item.diaId = primerDia.id;
        }

        function obtenerDiaDeItem(destino, item) {
            if (!destino || !item) return null;
            return destino.dias.find(d => d.id === item.diaId) || destino.dias[0] || null;
        }

        function obtenerEtiquetaDia(destino, item) {
            const dia = obtenerDiaDeItem(destino, item);
            if (!dia) return 'Día 1';
            const fecha = formatearFechaCortaItinerario(dia.fecha);
            return `DÍA ${dia.numero}${fecha ? ` (${fecha})` : ''}: ${dia.nombre}`;
        }

        function obtenerPartesFechaISO(fecha = '') {
            const valor = String(fecha || '').trim();
            const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!match) return null;
            const anio = Number(match[1]);
            const mes = Number(match[2]);
            const dia = Number(match[3]);
            if ([anio, mes, dia].some(n => Number.isNaN(n))) return null;
            return { anio, mes, dia };
        }

        function sumarDiasAFechaISO(fecha = '', dias = 0) {
            const partes = obtenerPartesFechaISO(fecha);
            if (!partes) return '';
            const base = new Date(Date.UTC(partes.anio, partes.mes - 1, partes.dia));
            base.setUTCDate(base.getUTCDate() + (Number(dias) || 0));
            const anio = base.getUTCFullYear();
            const mes = String(base.getUTCMonth() + 1).padStart(2, '0');
            const dia = String(base.getUTCDate()).padStart(2, '0');
            return `${anio}-${mes}-${dia}`;
        }

        function formatearFechaCortaItinerario(fecha = '') {
            const partes = obtenerPartesFechaISO(fecha);
            if (!partes) return '';
            return `${String(partes.dia).padStart(2, '0')}/${String(partes.mes).padStart(2, '0')}/${partes.anio}`;
        }

        function renderCampoFechaItinerario(fechaActual = '') {
            return `
                <div class="campo-form"><label>Fecha de actividad</label>
                    <input type="date" id="input-item-fecha" value="${fechaActual}">
                </div>
            `;
        }

        function guardarEstadoEnFirebase(forzar = false) {
            if (!firebaseDb || !estadoInicialSincronizado || !rutaEstadoFirebase) return;

            const estado = obtenerEstadoActual();
            const huellaActual = calcularHuellaEstado(estado);
            if (!forzar && huellaActual === ultimaHuellaSincronizada) return;

            firebaseDb.ref(rutaEstadoFirebase).set(estado)
                .then(() => {
                    ultimaHuellaSincronizada = huellaActual;
                })
                .catch((error) => {
                    console.error("No se pudo guardar en Firebase:", error);
                });
        }

        function iniciarSincronizacionFirebase() {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }

                const auth = firebase.auth();
                firebaseDb = firebase.database();

                auth.onAuthStateChanged((usuario) => {
                    if (!usuario) {
                        auth.signInAnonymously().catch((error) => {
                            console.error("No se pudo iniciar sesión anónima en Firebase:", error);
                            sincronizarEstadoConRutaPublica();
                        });
                        return;
                    }

                    const nuevaRutaEstado = obtenerRutaEstadoFirebase(usuario.uid);
                    if (rutaEstadoFirebase) {
                        firebaseDb.ref(rutaEstadoFirebase).off("value");
                    }
                    rutaEstadoFirebase = nuevaRutaEstado;

                    firebaseDb.ref(rutaEstadoFirebase).on("value", (snapshot) => {
                        const estadoRemoto = snapshot.val();
                        if (estadoRemoto) {
                            const huellaRemota = calcularHuellaEstado(estadoRemoto);
                            const huellaLocal = calcularHuellaEstado();
                            if (sincronizacionLocalEnCurso && huellaRemota === huellaLocal) {
                                sincronizacionLocalEnCurso = false;
                                ultimaHuellaSincronizada = huellaRemota;
                                return;
                            }
                            if (huellaRemota !== ultimaHuellaSincronizada) {
                                ultimaHuellaSincronizada = huellaRemota;
                                aplicarEstadoRemoto(estadoRemoto);
                            }
                        } else {
                            cargarMapa();
                            renderizarPantallaRecuerdos();
                            renderizarPantallaSonados();
                            estadoInicialSincronizado = true;
                            guardarEstadoEnFirebase(true);
                        }

                        estadoInicialSincronizado = true;
                    }, (error) => {
                        console.error("Error al leer estado desde Firebase:", error);
                        estadoInicialSincronizado = true;
                        cargarMapa();
                    });

                    if (!intervaloAutosave) {
                        intervaloAutosave = setInterval(() => guardarEstadoEnFirebase(), 1200);
                        window.addEventListener("beforeunload", () => guardarEstadoEnFirebase(true));
                    }
                });
            } catch (error) {
                console.error("No se pudo inicializar Firebase:", error);
                estadoInicialSincronizado = true;
                cargarMapa();
            }
        }

        function sincronizarEstadoConRutaPublica() {
            if (!firebaseDb) {
                estadoInicialSincronizado = true;
                cargarMapa();
                renderizarPantallaRecuerdos();
                renderizarPantallaSonados();
                return;
            }

            const rutaPublica = obtenerRutaEstadoFirebase();
            if (rutaEstadoFirebase && rutaEstadoFirebase !== rutaPublica) {
                firebaseDb.ref(rutaEstadoFirebase).off("value");
            }
            rutaEstadoFirebase = rutaPublica;

            firebaseDb.ref(rutaEstadoFirebase).on("value", (snapshot) => {
                const estadoRemoto = snapshot.val();
                if (estadoRemoto) {
                    const huellaRemota = calcularHuellaEstado(estadoRemoto);
                    const huellaLocal = calcularHuellaEstado();
                    if (sincronizacionLocalEnCurso && huellaRemota === huellaLocal) {
                        sincronizacionLocalEnCurso = false;
                        ultimaHuellaSincronizada = huellaRemota;
                        return;
                    }
                    if (huellaRemota !== ultimaHuellaSincronizada) {
                        ultimaHuellaSincronizada = huellaRemota;
                        aplicarEstadoRemoto(estadoRemoto);
                    }
                } else {
                    cargarMapa();
                    renderizarPantallaRecuerdos();
                    renderizarPantallaSonados();
                }
                estadoInicialSincronizado = true;
            }, (error) => {
                console.error("Error al leer estado público desde Firebase:", error);
                estadoInicialSincronizado = true;
                cargarMapa();
            });

            if (!intervaloAutosave) {
                intervaloAutosave = setInterval(() => guardarEstadoEnFirebase(), 1200);
                window.addEventListener("beforeunload", () => guardarEstadoEnFirebase(true));
            }
        }

        function manejarErrorMapaDetallado(err) {
            const mensaje = `No se pudo cargar ${ESTADOS_PROVINCIAS_URL}. Verifica tu conexión a internet y CORS.`;
            console.error(err);

            const contenedorMapa = document.getElementById('world-map');
            if (contenedorMapa && !document.getElementById('mapa-error-banner')) {
                const banner = document.createElement('div');
                banner.id = 'mapa-error-banner';
                banner.textContent = mensaje;
                contenedorMapa.appendChild(banner);
            }

            return mensaje;
        }

        window.irAPantalla = function(targetId) {
            document.querySelectorAll('.btn-menu').forEach(b => {
                if(b.getAttribute('data-target') === targetId) b.classList.add('activo');
                else b.classList.remove('activo');
            });
            document.querySelectorAll('.pantalla').forEach(p => {
                p.classList.remove('pantalla-activa');
                p.style.display = 'none';
            });

            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.style.display = 'flex';
                targetPanel.classList.add('pantalla-activa');
            }

            if (targetId === 'vista-vividas') renderizarPantallaRecuerdos();
            if (targetId === 'vista-por-vivir') renderizarPantallaSonados();
        };

        function cargarMapa() {
            const width = 800;
            const height = 450;
            const container = d3.select("#world-map");
            container.selectAll("*").remove();

            const svg = container.append("svg")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("preserveAspectRatio", "xMidYMid meet")
                .attr("id", "mapa-svg");

            const defs = svg.append("defs");
            const gradientePaises = defs.append("linearGradient")
                .attr("id", "relleno-pais")
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "100%")
                .attr("y2", "100%");
            gradientePaises.append("stop").attr("offset", "0%").attr("stop-color", "#d7f5dc");
            gradientePaises.append("stop").attr("offset", "100%").attr("stop-color", "#ace6c1");

            const gradienteMar = defs.append("linearGradient")
                .attr("id", "fondo-mar")
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "0%")
                .attr("y2", "100%");
            gradienteMar.append("stop").attr("offset", "0%").attr("stop-color", "#b3ecff");
            gradienteMar.append("stop").attr("offset", "100%").attr("stop-color", "#d7f2ff");

            svg.append("rect")
                .attr("width", width)
                .attr("height", height)
                .attr("fill", "url(#fondo-mar)")
                .attr("opacity", 0.85);

            const adornos = svg.append("g").attr("id", "mapa-adornos").attr("pointer-events", "none");
            const nubes = [
                { x: 105, y: 80, r: 22, c: "mapa-adorno-nube" },
                { x: 680, y: 95, r: 18, c: "mapa-adorno-nube nube-2" },
                { x: 580, y: 310, r: 16, c: "mapa-adorno-nube nube-3" }
            ];
            nubes.forEach(n => {
                adornos.append("circle").attr("cx", n.x).attr("cy", n.y).attr("r", n.r).attr("class", n.c);
                adornos.append("circle").attr("cx", n.x + 19).attr("cy", n.y + 4).attr("r", n.r * 0.85).attr("class", n.c);
                adornos.append("circle").attr("cx", n.x - 18).attr("cy", n.y + 5).attr("r", n.r * 0.8).attr("class", n.c);
            });

            const brillos = [
                { x: 200, y: 70, r: 5, c: "mapa-adorno-brillo" },
                { x: 740, y: 160, r: 4, c: "mapa-adorno-brillo brillo-2" },
                { x: 90, y: 300, r: 6, c: "mapa-adorno-brillo brillo-3" }
            ];
            brillos.forEach(b => adornos.append("circle").attr("cx", b.x).attr("cy", b.y).attr("r", b.r).attr("class", b.c));

            const g = svg.append("g").attr("id", "contenedor-mundo");

            const zoom = d3.zoom()
                .scaleExtent([1, 8]) 
                .on("zoom", (event) => {
                    g.attr("transform", event.transform);
                    g.selectAll(".pais").style("stroke-width", 1.5 / event.transform.k + "px");
                });

            svg.call(zoom);

            const projection = d3.geoMercator()
                .scale(120) 
                .translate([width / 2, height / 1.4]);

            const path = d3.geoPath().projection(projection);

            d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson").then(function(data) {

                const indiceUSA = data.features.findIndex(f => f.id === "USA");
                if (indiceUSA !== -1) {
                    const usaFeature = data.features[indiceUSA];

                    if (usaFeature.geometry && usaFeature.geometry.type === "MultiPolygon") {
                        const poligonosUSA = [];
                        const poligonosAlaska = [];
                        usaFeature.geometry.coordinates.forEach(poligono => {
                            const longitud = poligono[0][0][0];
                            const latitud = poligono[0][0][1]; 
                            if (latitud > 50) poligonosAlaska.push(poligono);
                            else if (longitud < -130 || latitud < 24) {} 
                            else poligonosUSA.push(poligono);
                        });
                        usaFeature.geometry.coordinates = poligonosUSA;
                        if (poligonosAlaska.length > 0) {
                            const alaskaFeature = JSON.parse(JSON.stringify(usaFeature)); 
                            alaskaFeature.id = "USA-AK"; 
                            alaskaFeature.properties.name = "Alaska";
                            alaskaFeature.geometry.coordinates = poligonosAlaska;
                            data.features.push(alaskaFeature);
                        }
                    }
                }

                g.selectAll("path")
                    .data(data.features)
                    .enter()
                    .append("path")
                    .attr("id", d => d.id) // Identificador para poder pintarlo
                    .attr("class", (d) => {
                        const idPais = d.id;
                        let clases = "pais";
                        if (idPais) {
                            if (paisesVisitados[idPais]) clases += " visitado";
                            if (destinosSonados[idPais]) clases += " sonado";
                        }
                        return clases;
                    })
                    .attr("d", path)
                    .on("mouseover", function(event, d) {
                        const [x, y] = d3.pointer(event, document.getElementById("world-map"));
                        const tooltip = d3.select("#tooltip");
                        tooltip.select("#tooltip-nombre").text(d.properties.name);
                        tooltip.style("left", x + "px").style("top", y + "px")
                               .classed("tooltip-oculto", false).classed("tooltip-visible", true);
                    })
                    .on("mouseout", function() {
                        d3.select("#tooltip").classed("tooltip-visible", false).classed("tooltip-oculto", true);
                    })
                    .on("click", function(event, d) {
                        event.stopPropagation();

                        const nombrePais = d.properties.name;
                        const idPais = d.id; 
                        const [x, y] = d3.pointer(event, document.getElementById("world-map"));
                        const menu = d3.select("#menu-contextual");
                        const elementoPais = d3.select(this);

                        const esVisitado = elementoPais.classed("visitado");
                        const esSonado = destinosSonados[idPais] ? true : false;
                        const colorTitulo = esVisitado ? "#00BCD4" : (esSonado ? "#FFB300" : "#FF4081"); 

                        // Menú Actualizado según instrucciones
                        menu.html(`
                            <div class="menu-header">
                                <h3 class="menu-titulo" style="color: ${colorTitulo};">${nombrePais}</h3>
                                <button id="cerrar-menu" class="btn-cerrar-menu">&times;</button>
                            </div>
                            <ul class="opciones-menu">
                                ${idPais && idPais !== "-99" ? `<li id="opc-visitado"><i data-lucide="${esVisitado ? "circle" : "check-circle"}"></i> ${esVisitado ? "Por visitar" : "¡Ya estuve aquí!"}</li>` : ''}
                                ${(idPais && idPais !== "-99" && esVisitado) ? `<li id="opc-recuerdos"><i data-lucide="camera"></i> Ver Recuerdos</li>` : ''}
                                ${idPais && idPais !== "-99" ? `<li id="opc-planear"><i data-lucide="map"></i> Planear Aventura</li>` : ''}
                                ${idPais && idPais !== "-99" ? `<li id="opc-explorar"><i data-lucide="search"></i> Explorar Zonas</li>` : ''}
                            </ul>
                        `);

                        lucide.createIcons();
                        menu.classed("menu-oculto", false).classed("menu-visible", true);

                        const menuWidth = menu.node().offsetWidth;
                        const menuHeight = menu.node().offsetHeight;
                        const mapWidth = document.getElementById("world-map").offsetWidth;
                        const mapHeight = document.getElementById("world-map").offsetHeight;

                        let finalX = x + 15; 
                        let finalY = y + 15;
                        if (finalX + menuWidth > mapWidth) finalX = x - menuWidth - 15;
                        if (finalY + menuHeight > mapHeight) finalY = y - menuHeight - 15;
                        if (finalX < 10) finalX = 10;
                        if (finalY < 10) finalY = 10;

                        menu.style("left", finalX + "px").style("top", finalY + "px");

                        if (idPais && idPais !== "-99") {
                            d3.select("#opc-visitado").on("click", function() {
                                if (!esVisitado) {
                                    paisesVisitados[idPais] = { nombre: nombrePais, zonas: [] };
                                    elementoPais.classed("visitado", true); 
                                } else {
                                    delete paisesVisitados[idPais];
                                    elementoPais.classed("visitado", false); 
                                }
                                menu.classed("menu-visible", false).classed("menu-oculto", true);
                            });

                            // Nuevo Listener para "Ver Recuerdos"
                            if (esVisitado) {
                                d3.select("#opc-recuerdos").on("click", function() {
                                    menu.classed("menu-visible", false).classed("menu-oculto", true);
                                    irAPantalla('vista-vividas');
                                    setTimeout(() => abrirAlbum(idPais), 50);
                                });
                            }

                            // Planear aventura se queda fijo
                            d3.select("#opc-planear").on("click", function() {
                                if (!esSonado) {
                                    destinosSonados[idPais] = { nombre: nombrePais, destinoFinal: nombrePais, escalas: [], escalasCiudades: [], itinerario: [], dias: [crearDia(1, 'Llegada')] };
                                    elementoPais.classed("sonado", true);
                                }
                                menu.classed("menu-visible", false).classed("menu-oculto", true);

                                irAPantalla('vista-por-vivir');
                                setTimeout(() => abrirPlanificador(idPais), 50);
                            });

                            d3.select("#opc-explorar").on("click", function() {
                                menu.classed("menu-visible", false).classed("menu-oculto", true);
                                abrirPantallaPais(idPais, nombrePais, d);
                            });
                        }

                        d3.select("#cerrar-menu").on("click", () => menu.classed("menu-visible", false).classed("menu-oculto", true));

                        d3.select("body").on("click.menu-cerrar", function(e) {
                            if (!menu.node().contains(e.target)) {
                                menu.classed("menu-visible", false).classed("menu-oculto", true);
                                d3.select("body").on("click.menu-cerrar", null);
                            }
                        });
                    });
            });
        }

        function normalizarTextoMapa(texto) {
            return (texto || "")
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .replace(/[^a-zA-Z0-9 ]/g, "")
                .trim()
                .toLowerCase();
        }

        function obtenerClavesPais(nombrePais, idPais) {
            const claves = new Set([normalizarTextoMapa(nombrePais)]);
            const equivalencias = {
                "united states": ["united states of america", "usa", "us"],
                "united states of america": ["united states", "usa", "us"],
                "russian federation": ["russia"],
                "russia": ["russian federation"],
                "czech republic": ["czechia"],
                "czechia": ["czech republic"],
                "ivory coast": ["cote divoire"],
                "cote divoire": ["ivory coast"],
                "south korea": ["korea republic of", "republic of korea"],
                "north korea": ["korea democratic peoples republic of"],
                "laos": ["lao pdr", "lao peoples democratic republic"],
                "eswatini": ["swaziland"],
                "myanmar": ["burma"]
            };

            const clavePrincipal = normalizarTextoMapa(nombrePais);
            if (equivalencias[clavePrincipal]) {
                equivalencias[clavePrincipal].forEach(v => claves.add(v));
            }

            if (idPais === "USA") {
                ["united states", "united states of america", "usa", "us"].forEach(v => claves.add(v));
            }

            return Array.from(claves);
        }

        function obtenerIdProvincia(feature) {
            if (!feature) return "";
            const properties = feature.properties || {};
            return (feature.id || properties.iso_3166_2 || properties.name || properties.name_en || "").toString();
        }

        function obtenerIdPathProvincia(idProvincia) {
            return `prov-${normalizarTextoMapa(idProvincia || "provincia").replace(/\s+/g, '-')}`;
        }


        function esRegionRemotaAExcluir(feature, idPais) {
            if (!feature || !feature.properties || !idPais) return false;

            const propiedades = feature.properties;
            const nombreRegion = normalizarTextoMapa(
                propiedades.name || propiedades.name_en || propiedades.woe_name || propiedades.name_alt || ""
            );
            const codigoRegion = (propiedades.postal || propiedades.iso_3166_2 || "").toUpperCase();

            const coincidePatron = (patrones = [], codigos = []) => {
                const coincideNombre = patrones.some(p => nombreRegion.includes(p));
                const coincideCodigo = codigos.some(c => codigoRegion === c || codigoRegion.endsWith(`-${c}`));
                return coincideNombre || coincideCodigo;
            };

            if (idPais === "USA") {
                return coincidePatron(
                    ["alaska", "hawaii", "aleut"],
                    ["AK", "HI"]
                );
            }

            if (idPais === "FRA") {
                return coincidePatron(
                    ["french guiana", "guyane", "guadeloupe", "martinique", "reunion", "mayotte", "saint pierre", "new caledonia", "polynesia"],
                    ["GF", "GP", "MQ", "RE", "YT", "PM", "NC", "PF", "BL", "MF", "WF", "TF"]
                );
            }

            if (idPais === "RUS") {
                return coincidePatron(
                    ["chukchi", "chukot", "kamchatka", "sakhalin", "kuril", "nenets"],
                    ["CHU", "KAM", "SAK", "NEN"]
                );
            }

            return false;
        }

        function provinciaPerteneceAPais(feature, nombrePais, idPais, geoData = null) {
            if (!feature || !feature.properties) return false;
            if (esRegionRemotaAExcluir(feature, idPais)) return false;

            if (geoData && feature.geometry) {
                try {
                    const centroide = d3.geoCentroid(feature);
                    if (Array.isArray(centroide) && centroide.length === 2 && d3.geoContains(geoData, centroide)) {
                        return true;
                    }
                } catch (e) {
                    // Si falla el cálculo espacial, usamos el plan B por nombres/códigos.
                }
            }

            const admin = normalizarTextoMapa(feature.properties.admin);
            const geonunit = normalizarTextoMapa(feature.properties.geonunit);
            const codigosFeature = [
                feature.properties.sov_a3,
                feature.properties.adm0_a3,
                feature.properties.iso_a3,
                feature.properties.gu_a3,
                feature.properties.brk_a3
            ].map(v => (v || "").toUpperCase()).filter(Boolean);

            const clavesPais = obtenerClavesPais(nombrePais, idPais);
            return clavesPais.includes(admin) || clavesPais.includes(geonunit) || (idPais && codigosFeature.includes(idPais));
        }

        function abrirPantallaPais(idPais, nombrePais, geoData) {
            const width = 800;
            const height = 450;
            const container = d3.select("#world-map");

            d3.select("#mapa-svg").style("display", "none");
            d3.select("#mapa-detalle").remove();

            const svgPais = container.append("svg")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("id", "mapa-detalle");

            const gDetalle = svgPais.append("g");
            let path = d3.geoPath().projection(
                d3.geoMercator().fitExtent([[40, 40], [width - 80, height - 80]], geoData)
            );

            d3.json(ESTADOS_PROVINCIAS_URL).then(function(data) {
                const provincias = data.features.filter(p => {
                    const geometria = p.geometry && (p.geometry.type === "Polygon" || p.geometry.type === "MultiPolygon");
                    if (!geometria) return false;
                    return provinciaPerteneceAPais(p, nombrePais, idPais, geoData);
                });

                if (provincias.length === 0) {
                    alert(`No encontramos ciudades/provincias para ${nombrePais} en ${ESTADOS_PROVINCIAS_URL}`);
                    return;
                }

                const proyeccionDetalle = d3.geoMercator().fitExtent(
                    [[40, 40], [width - 80, height - 80]],
                    { type: "FeatureCollection", features: provincias }
                );
                path = d3.geoPath().projection(proyeccionDetalle);

                gDetalle.append("path")
                    .datum(geoData)
                    .attr("d", path)
                    .style("fill", "#D4F7FF")
                    .style("stroke", "#00BCD4")
                    .style("stroke-width", "3")
                    .style("stroke-dasharray", "8 6");

                gDetalle.selectAll(".provincia")
                    .data(provincias)
                    .enter()
                    .append("path")
                    .attr("class", "provincia")
                    .attr("id", d => obtenerIdPathProvincia(obtenerIdProvincia(d)))
                    .attr("d", path)
                    .style("fill", function(d) {
                        const provId = obtenerIdProvincia(d);
                        if (provinciasVisitadas[idPais] && provinciasVisitadas[idPais][provId]) return "#FF6B9D";
                        if (destinosSonados[idPais] && destinosSonados[idPais].provincias && destinosSonados[idPais].provincias[provId]) return "#FFD166";
                        return "#FFF9FF";
                    })
                    .on("mouseover", function(event, d) {
                        const nombre = d.properties.name || d.properties.name_en || "Provincia";
                        const [x, y] = d3.pointer(event, container.node());

                        d3.select("#tooltip")
                            .style("left", x + "px")
                            .style("top", y + "px")
                            .classed("tooltip-oculto", false)
                            .classed("tooltip-visible", true);

                        d3.select("#tooltip-nombre").text(nombre);
                    })
                    .on("mouseout", function() {
                        d3.select("#tooltip")
                            .classed("tooltip-visible", false)
                            .classed("tooltip-oculto", true);
                    })
                    .on("click", function(event, d) {
                        event.stopPropagation();

                        const nombreProvincia = d.properties.name || d.properties.name_en || "Provincia";
                        const idProvincia = obtenerIdProvincia(d);
                        const idPathProvincia = obtenerIdPathProvincia(idProvincia);
                        const [x, y] = d3.pointer(event, container.node());
                        const menu = d3.select("#menu-contextual");
                        const esVisitada = provinciasVisitadas[idPais] && provinciasVisitadas[idPais][idProvincia];

                        menu.html(`
                            <div class="menu-header">
                                <h3 class="menu-titulo" style="color:#FF4081">${nombreProvincia}</h3>
                                <button id="cerrar-menu" class="btn-cerrar-menu">&times;</button>
                            </div>
                            <ul class="opciones-menu">
                                <li id="opc-prov-visitado">
                                    <i data-lucide="check-circle"></i>
                                    ${esVisitada ? "Quitar visita" : "¡Ya estuve aquí!"}
                                </li>
                                <li id="opc-prov-planear">
                                    <i data-lucide="map"></i>
                                    Planear aventura
                                </li>
                            </ul>
                        `);

                        lucide.createIcons();
                        menu.classed("menu-oculto", false)
                            .classed("menu-visible", true)
                            .style("left", x + "px")
                            .style("top", y + "px");

                        d3.select("#opc-prov-visitado").on("click", function() {
                            if (!provinciasVisitadas[idPais]) provinciasVisitadas[idPais] = {};
                            const selectorPath = `#${CSS.escape(idPathProvincia)}`;
                            const pathElem = d3.select(selectorPath);

                            if (!provinciasVisitadas[idPais][idProvincia]) {
                                provinciasVisitadas[idPais][idProvincia] = { nombre: nombreProvincia };
                                pathElem.classed('visitada', true).style("fill", "#FF6B9D");

                                if (!paisesVisitados[idPais]) {
                                    paisesVisitados[idPais] = { nombre: nombrePais, albumes: [], historias: [], musica: null };
                                }
                                d3.select(`.pais[id="${idPais}"]`).classed('visitado', true);
                            } else {
                                delete provinciasVisitadas[idPais][idProvincia];
                                pathElem.classed('visitada', false).style("fill", "#FFF9FF");
                            }

                            menu.classed("menu-visible", false).classed("menu-oculto", true);
                            renderizarPantallaRecuerdos();
                        });

                        d3.select("#opc-prov-planear").on("click", function() {
                            if (!destinosSonados[idPais]) destinosSonados[idPais] = { nombre: nombrePais, destinoFinal: nombrePais, escalas: [], escalasCiudades: [], itinerario: [], dias: [crearDia(1, 'Llegada')] };
                            menu.classed("menu-visible", false).classed("menu-oculto", true);
                            irAPantalla('vista-por-vivir');
                            setTimeout(() => abrirPlanificador(idPais), 50);
                        });

                        d3.select("#cerrar-menu").on("click", () => menu.classed("menu-visible", false).classed("menu-oculto", true));
                    });
            }).catch(err => {
                alert(manejarErrorMapaDetallado(err));
            });

            mostrarBotonRegreso();
        }

        function mostrarBotonRegreso() {
            d3.select("#btn-volver-mapa").remove(); 
            d3.select("#world-map").append("button").attr("id", "btn-volver-mapa")
                .style("position", "absolute").style("bottom", "25px").style("left", "50%").style("transform", "translateX(-50%)").style("z-index", "100")
                .style("background", "linear-gradient(45deg, #FF4081, #FF80AB)").style("border", "4px solid #FFFFFF").style("color", "white")
                .style("padding", "15px 35px").style("border-radius", "50px").style("font-weight", "900").style("font-size", "1.1rem")
                .style("font-family", "'Quicksand', sans-serif").style("cursor", "pointer").style("box-shadow", "0 0 20px rgba(255, 64, 129, 0.6)")
                .html("✨ Volver al Mundo ✨")
                .on("click", function() {
                    d3.select("#mapa-detalle").remove(); d3.select("#titulo-pais-explora").remove();
                    d3.select(this).remove(); d3.select("#tooltip").classed("tooltip-visible", false).classed("tooltip-oculto", true);
                    d3.select("#mapa-svg").style("display", "block");
                });
        }

        function renderizarPantallaSonados() {
            estadoVistaSonados = { modo: 'lista', idPais: null };
            normalizarDestinosSonados();
            estadoVistaSonados = { modo: 'lista', idPais: null };
            const contenedor = document.getElementById('vista-por-vivir');
            const idsPaises = Object.keys(destinosSonados);

            contenedor.innerHTML = `
                <div class="encabezado-seccion" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2><i data-lucide="heart"></i> Destinos por Vivir</h2>
                    <button class="btn-nueva-aventura" onclick="mostrarSelectorNuevoDestino()" style="background: var(--primary); color: white; border: none; padding: 10px 15px; border-radius: 20px; font-family: inherit; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(255, 64, 129, 0.3);">
                        <i data-lucide="plus-circle"></i> Nueva Aventura
                    </button>
                </div>
                <div id="selector-nuevo-destino" style="display:none; background: #FFF8F1; margin: 15px; padding: 20px; border-radius: 15px; border: 2px dashed var(--primary); animation: fadeIn 0.3s ease;">
                    <h3 style="margin-top:0; color: var(--primary);">¿A dónde quieres ir?</h3>
                    <p style="font-size: 0.9rem; color: #607D8B;">Selecciona tu destino final para empezar a planear:</p>
                    <select id="select-pais-nuevo" onchange="cargarCiudadesAventura()" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #CFD8DC; margin-bottom: 10px; font-family: inherit; font-size: 1rem; background: white;">
                    <option value="" disabled selected>Elige un país...</option>
                </select>

                <select id="select-ciudad-aventura" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #CFD8DC; margin-bottom: 15px; font-family: inherit; font-size: 1rem; background: white;">
                    <option value="" disabled selected>Elige una ciudad...</option>
                </select>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="confirmarNuevoDestino()" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #4CAF50; color: white; font-weight: bold; cursor: pointer;">Crear Aventura</button>
                        <button onclick="document.getElementById('selector-nuevo-destino').style.display='none'" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #ECEFF1; color: #546E7A; font-weight: bold; cursor: pointer;">Cancelar</button>
                    </div>
                </div>
                <div class="contenedor-scroll" id="scroll-sonados"></div>
            `;

            const scrollArea = document.getElementById('scroll-sonados');

            setTimeout(() => {
                const select = document.getElementById('select-pais-nuevo');
                if (select) {
                    const paisesMapa = d3.selectAll('.pais').data();
                    if (paisesMapa && paisesMapa.length > 0) {
                        select.innerHTML = '<option value="" disabled selected>Elige un país...</option>';
                        const listaOrdenada = paisesMapa
                            .map(d => ({ id: d.id, nombre: d.properties.name }))
                            .sort((a, b) => a.nombre.localeCompare(b.nombre));

                        listaOrdenada.forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p.id;
                            opt.textContent = p.nombre;
                            select.appendChild(opt);
                        });
                    }
                }
            }, 100);

            if (idsPaises.length === 0) {
                scrollArea.innerHTML = `<div class="mensaje-vacio"><i data-lucide="compass"></i><p>No tienes aventuras planeadas todavía.</p></div>`;
            } else {
                const listaHTML = document.createElement('div');
                listaHTML.className = 'lista-paises';
                idsPaises.forEach(id => {
                    const pais = destinosSonados[id];
                    const numItems = Array.isArray(pais.itinerario) ? pais.itinerario.length : 0;
                    const nombrePrincipal = obtenerNombreCabeceraDestino(pais);
                    const escalasResumen = obtenerResumenEscalas(pais);
                    const portadaLista = pais.portadaUrl || 'https://via.placeholder.com/240x150?text=Sin+Portada';
                    listaHTML.innerHTML += `
                        <div class="tarjeta-pais">
                            <div class="info-pais">
                                <div class="icono-bandera" style="background: #FFF8E1; color: #FFB300;"><i data-lucide="star"></i></div>
                                <div>
                                    <h3 class="destino-principal dorado">${nombrePrincipal}</h3>
                                    ${escalasResumen ? `<div class="destino-escalas">(${escalasResumen})</div>` : ''}
                                    <span class="zonas-badge">${numItems} pasos</span>
                                </div>
                            </div>
                            <div class="acciones-itinerario-card">
                                <img class="miniatura-portada-lista" src="${portadaLista}" alt="Portada de ${nombrePrincipal}">
                                <button class="btn-accion-pais secundario" onclick="abrirPlanificador('${id}')">Ver Itinerario <i data-lucide="calendar"></i></button>
                            </div>
                        </div>`;
                });
                scrollArea.appendChild(listaHTML);
            }
            lucide.createIcons();
        }

        window.renderizarPantallaRecuerdos = function() {
            estadoVistaRecuerdos = { modo: 'lista', idPais: null, idProvincia: null, submodo: 'ver', seccionNuevo: 'drive' };
            const contenedor = document.getElementById('vista-vividas');
            const idsPaises = Object.keys(paisesVisitados);

            contenedor.innerHTML = `
                <div class="encabezado-seccion" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <h2><i data-lucide="camera"></i> Galería de Recuerdos</h2>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <button class="btn-nueva-aventura" onclick="mostrarSelectorNuevoRecuerdo()" style="background: var(--secondary); color: white; border: none; padding: 10px 15px; border-radius: 20px; font-family: inherit; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(0, 188, 212, 0.3);">
                            <i data-lucide="plus-circle"></i> + Nuevo Recuerdo
                        </button>
                    </div>
                </div>
                
                <div id="selector-nuevo-recuerdo" style="display:none; background: #FDF2F5; margin: 15px; padding: 20px; border-radius: 15px; border: 2px dashed var(--primary); animation: fadeIn 0.3s ease;">
                <h3 style="margin-top:0; color: var(--primary);">¿Donde estuvimos?</h3>
                <p style="font-size: 0.9rem; color: #607D8B;">Elegí país</p>
                
                <select id="select-pais-recuerdo" onchange="cargarCiudadesRecuerdo()" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #CFD8DC; margin-bottom: 15px; font-family: inherit; font-size: 1rem; background: white;">
                    <option value="" disabled selected>Elegí un país...</option>
                </select>

                <div id="contenedor-ciudad-recuerdo" style="display:none; margin-bottom: 15px;">
                    <select id="select-ciudad-recuerdo" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #CFD8DC; font-family: inherit; font-size: 1rem; background: white;">
                        <option value="" disabled selected>¿Qué ciudad, bebé?</option>
                    </select>
                </div>

                <div style="display: flex; gap: 10px;">
                    <button onclick="confirmarNuevoRecuerdo()" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #4CAF50; color: white; font-weight: bold; cursor: pointer;">Guardar Recuerdo</button>
                    <button onclick="document.getElementById('selector-nuevo-recuerdo').style.display='none'" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #ECEFF1; color: #546E7A; font-weight: bold; cursor: pointer;">Cancelar</button>
                </div>
            </div>

                <div class="contenedor-scroll" id="scroll-recuerdos"></div>
            `;

            const scrollArea = document.getElementById('scroll-recuerdos');

            // Cargar lista de países en el selector
            setTimeout(() => {
                const select = document.getElementById('select-pais-recuerdo');
                if (select) {
                    const paisesMapa = d3.selectAll('.pais').data();
                    if (paisesMapa && paisesMapa.length > 0) {
                        select.innerHTML = '<option value="" disabled selected>Elige un país...</option>';
                        const listaOrdenada = paisesMapa
                            .map(d => ({ id: d.id, nombre: d.properties.name }))
                            .sort((a, b) => a.nombre.localeCompare(b.nombre));

                        listaOrdenada.forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p.id;
                            opt.textContent = p.nombre;
                            select.appendChild(opt);
                        });
                    }
                }
            }, 100);

            if (idsPaises.length === 0) {
                scrollArea.innerHTML = `<div class="mensaje-vacio"><i data-lucide="map"></i><p>Aún no has marcado países visitados.</p></div>`;
            } else {
                const listaHTML = document.createElement('div');
                listaHTML.className = 'lista-paises';
                idsPaises.forEach(id => {
                    const pais = paisesVisitados[id];
                    const numMemorias = contarMemoriasPais(id);
                    listaHTML.innerHTML += `
                        <div class="tarjeta-pais">
                            <div class="info-pais">
                                <div class="icono-bandera"><i data-lucide="map-pin"></i></div>
                                <div><h3 class="nombre-pais-lista">${pais.nombre}</h3><span class="zonas-badge">${numMemorias} memorias</span></div>
                            </div>
                            <button class="btn-accion-pais" onclick="abrirAlbum('${id}')">Ver Álbumes <i data-lucide="chevron-right"></i></button>
                        </div>`;
                });
                scrollArea.appendChild(listaHTML);
            }
            lucide.createIcons();
        }

        window.mostrarSelectorNuevoRecuerdo = function() {
            document.getElementById('selector-nuevo-recuerdo').style.display = 'block';
        };

        window.cargarCiudadesAventura = function() {
            const selectPais = document.getElementById('select-pais-nuevo');
            const selectCiudad = document.getElementById('select-ciudad-aventura');
            if (!selectPais || !selectCiudad) return;

            const idPais = selectPais.value;
            if (!idPais) {
                selectCiudad.innerHTML = '<option value="" disabled selected>Elige una ciudad...</option>';
                return;
            }

            const nombrePais = selectPais.options[selectPais.selectedIndex]?.text || "";
            selectCiudad.innerHTML = '<option value="" disabled selected>Cargando ciudades...</option>';

            d3.json(ESTADOS_PROVINCIAS_URL).then(function(data) {
                const ciudades = data.features
                    .filter(p => provinciaPerteneceAPais(p, nombrePais, idPais))
                    .map(p => p.properties.name || p.properties.name_en || "")
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));

                const ciudadesUnicas = [...new Set(ciudades)];
                if (ciudadesUnicas.length === 0) {
                    selectCiudad.innerHTML = '<option value="" disabled selected>No encontramos ciudades</option>';
                    return;
                }

                selectCiudad.innerHTML = '<option value="" disabled selected>Elige una ciudad...</option>';
                ciudadesUnicas.forEach(ciudad => {
                    const opt = document.createElement('option');
                    opt.value = ciudad;
                    opt.textContent = ciudad;
                    selectCiudad.appendChild(opt);
                });
            }).catch(function() {
                selectCiudad.innerHTML = '<option value="" disabled selected>No se pudieron cargar ciudades</option>';
            });
        };

        window.cargarCiudadesRecuerdo = function() {
            const selectPais = document.getElementById('select-pais-recuerdo');
            const idPais = selectPais.value;
            const nombrePais = selectPais.options[selectPais.selectedIndex].text;
            const contenedor = document.getElementById('contenedor-ciudad-recuerdo');
            const selectCiudad = document.getElementById('select-ciudad-recuerdo');

            if (!idPais) return;

            contenedor.style.display = 'block';
            selectCiudad.innerHTML = '<option value="" disabled selected>Buscando Ciudades...</option>';

            d3.json(ESTADOS_PROVINCIAS_URL).then(function(data) {
                const ciudades = data.features.filter(p => provinciaPerteneceAPais(p, nombrePais, idPais));
                selectCiudad.innerHTML = '<option value="" disabled selected>¿Ciudad?</option>';

                ciudades.sort((a,b) => (a.properties.name || "").localeCompare(b.properties.name || "")).forEach(prov => {
                    const nombre = prov.properties.name || "Provincia";
                    const idProv = prov.id || (prov.properties.name).replace(/\s+/g,'_');
                    selectCiudad.innerHTML += `<option value="${idProv}">${nombre}</option>`;
                });
            }).catch(err => {
                const mensaje = manejarErrorMapaDetallado(err);
                alert(mensaje);
                selectCiudad.innerHTML = '<option value="" disabled selected>No se pudieron cargar ciudades.</option>';
            });
        };

        window.confirmarNuevoRecuerdo = function() {
            const selectPais = document.getElementById('select-pais-recuerdo');
            const selectCiu = document.getElementById('select-ciudad-recuerdo');
            const idPais = selectPais.value;
            const nombrePais = selectPais.options[selectPais.selectedIndex]?.text;
            const idProv = selectCiu.value;
            const nombreProv = selectCiu.options[selectCiu.selectedIndex]?.text;

            if (idPais && idProv) {
                // 1. Guardar y pintar País
                if (!paisesVisitados[idPais]) {
                    paisesVisitados[idPais] = { nombre: nombrePais, albumes: [], historias: [], musica: null };
                }
                d3.select(`.pais[id="${idPais}"]`).classed('visitado', true);

                // 2. Guardar y pintar Ciudad
                if (!provinciasVisitadas[idPais]) provinciasVisitadas[idPais] = {};
                if (!provinciasVisitadas[idPais][idProv]) {
                    provinciasVisitadas[idPais][idProv] = { nombre: nombreProv, albumes: [], historias: [] };
                }

                // Forzar el pintado de la ciudad (por si el mapa detallado está cargado)
                try {
                    d3.select(`#${CSS.escape(idProv)}`).classed('visitada', true);
                } catch(e) {}

                renderizarPantallaRecuerdos();
                document.getElementById('selector-nuevo-recuerdo').style.display = 'none';
                alert("Ubicación marcada como visitada.");
            } else {
                alert("Por favor, selecciona país y ciudad.");
            }
        };

        window.abrirAlbum = function(idPais, idProvincia = null) {
            const pais = paisesVisitados[idPais];
            if (!pais) {
                renderizarPantallaRecuerdos();
                return;
            }
            const scrollArea = document.getElementById('scroll-recuerdos');

            // Si NO hay provincia seleccionada, siempre mostramos el menú de provincias (eliminamos el acceso general)
            if (!idProvincia) {
                estadoVistaRecuerdos = { modo: 'provincias', idPais, idProvincia: null, submodo: 'ver', seccionNuevo: 'drive' };
                const provs = provinciasVisitadas[idPais] || {};
                const idsProvincias = Object.keys(provs);

                scrollArea.innerHTML = `
                    <div class="cabecera-detalle" style="justify-content: flex-start; gap: 15px; margin-bottom: 20px;">
                        <button class="btn-volver" onclick="renderizarPantallaRecuerdos()" title="Volver"><i data-lucide="arrow-left"></i></button>
                        <h2 style="margin:0;"><i data-lucide="map"></i> Destinos en ${pais.nombre}</h2>
                    </div>
                    
                    <div style="background: #E1F5FE; padding: 15px; border-radius: 12px; margin-bottom: 20px; color: #0288D1; display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;">
                        <span style="font-weight: bold; flex: 1;">Selecciona la ciudad/provincia para ver o añadir sus recuerdos:</span>
                        <button onclick="mostrarSelectorNuevaCiudad('${idPais}')" style="background: var(--secondary); color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                            <i data-lucide="plus-circle" style="width: 18px;"></i> Agregar ciudad
                        </button>
                    </div>
                    
                    <div class="galeria-grid">
                        ${idsProvincias.length === 0 ? '<div style="grid-column: 1/-1; text-align: center; color: #90A4AE; padding: 30px; font-style: italic; background: white; border-radius: 12px; border: 1px dashed #CFD8DC;">Aún no has agregado ninguna ciudad a este país. Toca "Agregar ciudad" para empezar.</div>' : ''}
                        ${idsProvincias.map(pid => `
                            <div class="tarjeta-agregar" style="height: auto; padding: 20px; border: 3px solid var(--secondary); background: #F0FBFF; cursor: pointer;" onclick="window.abrirAlbumDetalle('${idPais}', '${pid}')">
                                <i data-lucide="map-pin" style="width: 40px; height: 40px; color: var(--secondary);"></i>
                                <span style="color: var(--secondary); margin-top: 10px; text-align: center; font-weight: bold;">${provs[pid].nombre}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                lucide.createIcons();
                return;
            }

            // Si ya se pasó una ciudad, vamos directo al detalle
            window.abrirAlbumDetalle(idPais, idProvincia);
        };

        window.mostrarSelectorNuevaCiudad = function(idPais) {
            const pais = paisesVisitados[idPais];
            const modal = document.createElement('div');
            modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;";
            modal.innerHTML = `
                <div style="background:white; padding: 25px; border-radius:15px; width:100%; max-width:400px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                    <h3 style="margin-top:0; color: var(--secondary); display:flex; align-items:center; gap:8px;"><i data-lucide="map-pin"></i> Nueva ciudad en ${pais.nombre}</h3>
                    <p style="color: #546E7A; font-size: 0.95rem; margin-bottom: 15px;">
                    <select id="select-nueva-ciudad" style="width: 100%; padding: 12px; border: 1px solid #CFD8DC; border-radius: 8px; font-family: inherit; margin-bottom: 20px; box-sizing: border-box; outline: none; font-size: 1rem;">
                        <option value="" disabled selected>Cargando ciudades...</option>
                    </select>
                    <div style="display:flex; justify-content: flex-end; gap: 10px;">
                        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: #ECEFF1; color: #546E7A; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">Cancelar</button>
                        <button id="btn-guardar-ciudad" style="background: var(--secondary); color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">Guardar Ciudad</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            lucide.createIcons();

            // Cargamos las provincias desde la fuente remota
            d3.json(ESTADOS_PROVINCIAS_URL).then(function(data){
                const provincias = data.features.filter(p => provinciaPerteneceAPais(p, pais.nombre, idPais));
                const select = document.getElementById('select-nueva-ciudad');
                select.innerHTML = '<option value="" disabled selected>Elegí un destino ...</option>';

                provincias.sort((a,b) => (a.properties.name || "").localeCompare(b.properties.name || "")).forEach(prov => {
                    const nombre = prov.properties.name || prov.properties.name_en || "Provincia";
                    const idProv = obtenerIdProvincia(prov);

                    // Solo te muestro las que todavía no me hiciste conocer...
                    if (!provinciasVisitadas[idPais] || !provinciasVisitadas[idPais][idProv]) {
                        const opt = document.createElement('option');
                        opt.value = idProv;
                        opt.textContent = nombre;
                        select.appendChild(opt);
                    }
                });

                if(select.options.length === 1) {
                    select.innerHTML = '<option value="" disabled selected>Elige una ciudad</option>';
                }
            }).catch(err => {
                const mensaje = manejarErrorMapaDetallado(err);
                alert(mensaje);
                const select = document.getElementById('select-nueva-ciudad');
                if (select) {
                    select.innerHTML = '<option value="" disabled selected>No se pudieron cargar destinos.</option>';
                }
            });

            // Función para clavar nuestra nueva conquista
            document.getElementById('btn-guardar-ciudad').onclick = function() {
                const select = document.getElementById('select-nueva-ciudad');
                const idProvinciaGenerado = select.value;
                const nombre = select.options[select.selectedIndex]?.text;

                if (idProvinciaGenerado) {
                    if (!provinciasVisitadas[idPais]) provinciasVisitadas[idPais] = {};
                    const idPathProvincia = obtenerIdPathProvincia(idProvinciaGenerado);
                    provinciasVisitadas[idPais][idProvinciaGenerado] = {
                        nombre,
                        albumes: [],
                        historias: [],
                        musica: null
                    };

                    // Marcamos el país como visitado automáticamente
                    if (!paisesVisitados[idPais]) {
                        paisesVisitados[idPais] = {
                            nombre: pais.nombre,
                            albumes: [],
                            historias: [],
                            musica: null
                        };
                    }

                    // Pintamos en rojo tanto el país como la ciudad en el mapa
                    d3.select(`.pais[id="${idPais}"]`).classed('visitado', true);
                    try {
                        d3.select(`#${CSS.escape(idPathProvincia)}`).classed('visitada', true).style("fill", "#FF0000");
                    } catch(e) { console.log("No se pudo pintar la ciudad aún"); }

                    modal.remove(); 
                    window.abrirAlbum(idPais);

                    // Aseguramos que el país quede marcado como totalmente nuestro
                    if(!paisesVisitados[idPais]){
                        paisesVisitados[idPais] = {
                            nombre: pais.nombre,
                            albumes: [],
                            historias: [],
                            musica: null
                        };
                    }

                    // Le damos el colorcito de "visitado" al país entero en el mapa mundial
                    d3.select(`.pais[id="${idPais}"]`).classed('visitado', true);

                    // Intentamos pintar la provincia si tenemos el mapita detallado abierto en el fondo
                    try {
                        d3.select(`#${CSS.escape(idPathProvincia)}`).classed('visitada', true).style("fill", "#FF0000");
                    } catch(e) {}

                    modal.remove(); 
                    window.abrirAlbum(idPais); 
                } else {
                    alert("elegí una ciudad primero para que guardemos el recuerdo.");
                }
            };
        };

        window.abrirAlbumDetalle = function(idPais, idProvincia, submodo = null) {
            const pais = paisesVisitados[idPais];
            if (!pais) {
                renderizarPantallaRecuerdos();
                return;
            }

            const idProvinciaNormalizado = idProvincia || null;
            const estabaEnMismoDestino = estadoVistaRecuerdos.idPais === idPais && estadoVistaRecuerdos.idProvincia === idProvinciaNormalizado;
            // Al entrar a una ciudad mostramos primero la vista de recuerdos guardados.
            // Solo abrimos "nuevo" cuando se pide explícitamente desde el botón.
            const submodoActual = (submodo === 'nuevo') ? 'nuevo' : 'ver';
            const seccionNuevo = estabaEnMismoDestino ? (estadoVistaRecuerdos.seccionNuevo || 'drive') : 'drive';
            estadoVistaRecuerdos = { modo: 'detalle', idPais, idProvincia: idProvinciaNormalizado, submodo: submodoActual, seccionNuevo: seccionNuevo };
            let objDestino = pais;
            let nombreTitulo = pais.nombre;

            if (idProvincia) {
                const provincia = provinciasVisitadas[idPais]?.[idProvincia];
                if (!provincia) {
                    abrirAlbum(idPais);
                    return;
                }
                objDestino = provincia;
                nombreTitulo = `${objDestino.nombre} (${pais.nombre})`;
            }

            if (!objDestino.albumes) objDestino.albumes = [];
            if (!objDestino.historias) objDestino.historias = [];

            const scrollArea = document.getElementById('scroll-recuerdos');
            const tieneMusica = !!objDestino.musica;

            // Lógica de navegación: si estamos dentro de una ciudad, "Volver" nos lleva a la lista de ciudades.
            const btnVolverAccion = idProvincia ? `abrirAlbum('${idPais}')` : `renderizarPantallaRecuerdos()`;
            const paramProv = idProvincia ? `'${idProvincia}'` : `null`;
            const botonVerEstilo = submodoActual === 'ver'
                ? 'background: #4f46e5; color: white; box-shadow: 0 4px 10px rgba(79,70,229,0.25);'
                : 'background: #EEF2FF; color: #4f46e5;';
            const botonNuevoEstilo = submodoActual === 'nuevo'
                ? 'background: var(--secondary); color: white; box-shadow: 0 4px 10px rgba(0, 188, 212, 0.3);'
                : 'background: #E0F7FA; color: #00838F;';
            const bloqueNuevo = submodoActual === 'nuevo' ? `
                <div style="display: flex; gap: 10px; margin-bottom: 20px; background: #f1f5f9; padding: 5px; border-radius: 12px;">
                    <button id="tab-drive" onclick="cambiarSeccionRecuerdos('drive', '${idPais}', ${paramProv})" style="flex:1; padding:10px; border:none; border-radius:8px; cursor:pointer; font-weight:bold; background: var(--secondary); color:white;">
                        <i data-lucide="folder" style="width:16px; vertical-align:middle;"></i> Drive
                    </button>
                    <button id="tab-historias" onclick="cambiarSeccionRecuerdos('historias', '${idPais}', ${paramProv})" style="flex:1; padding:10px; border:none; border-radius:8px; cursor:pointer; font-weight:bold; background:transparent; color:#546E7A;">
                        <i data-lucide="book-open" style="width:16px; vertical-align:middle;"></i> Historias
                    </button>
                </div>

                <div id="form-drive" style="background: white; padding: 20px; border-radius: 15px; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #E1F5FE;">
                    <h4 style="margin-top:0; color: var(--secondary); display:flex; align-items:center; gap:8px;"><i data-lucide="plus-circle"></i> Agregar Nueva Carpeta</h4>
                    <div style="display:flex; flex-direction: column; gap:10px;">
                        <input type="text" id="nombre-carpeta-drive" placeholder="Nombre (ej: Fotos del Hotel)" style="padding:12px; border-radius:10px; border:1px solid #CFD8DC; font-family: inherit;">
                        <input type="text" id="portada-drive-url" placeholder="URL de portada (opcional)" style="padding:12px; border-radius:10px; border:1px solid #CFD8DC; font-family: inherit;">
                        <label style="font-size:0.9rem; color:#546E7A; font-weight:700;">o subir portada desde tu PC:
                            <input type="file" id="portada-drive-file" accept="image/*" style="display:block; margin-top:6px; width:100%;">
                        </label>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="url-carpeta-drive" placeholder="Link de Drive..." style="flex:1; padding:12px; border-radius:10px; border:1px solid #CFD8DC; font-family: inherit;">
                            <button onclick="agregarCarpetaDrive('${idPais}', ${paramProv})" style="background: var(--secondary); color:white; border:none; padding:12px 20px; border-radius:10px; cursor:pointer; font-weight:bold;"><i data-lucide="save"></i></button>
                        </div>
                    </div>
                </div>

                <div id="form-historias" style="display:none; background: white; padding: 20px; border-radius: 15px; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #FCE4EC;">
                    <h4 style="margin-top:0; color: var(--primary); display:flex; align-items:center; gap:8px;"><i data-lucide="pen-tool"></i> Escribir una Anécdota</h4>
                    <div style="display:flex; flex-direction: column; gap:10px;">
                        <input type="text" id="titulo-historia" placeholder="Título de la historia..." style="padding:12px; border-radius:10px; border:1px solid #CFD8DC; font-family: inherit;">
                        <input type="text" id="img-historia" placeholder="URL de la imagen de portada..." style="padding:12px; border-radius:10px; border:1px solid #CFD8DC; font-family: inherit;">
                        <label style="font-size:0.9rem; color:#546E7A; font-weight:700;">o subir portada desde tu PC:
                            <input type="file" id="img-historia-file" accept="image/*" style="display:block; margin-top:6px; width:100%;">
                        </label>
                        <textarea id="texto-historia" placeholder="Cuéntame qué pasó en este viaje..." style="padding:12px; border-radius:10px; border:1px solid #CFD8DC; font-family: inherit; min-height: 100px; resize: vertical;"></textarea>
                        <button onclick="agregarHistoria('${idPais}', ${paramProv})" style="background: var(--primary); color:white; border:none; padding:12px 20px; border-radius:10px; cursor:pointer; font-weight:bold; align-self: flex-end;">Guardar Historia</button>
                    </div>
                </div>
            ` : '';

            scrollArea.innerHTML = `
                <div class="cabecera-detalle" style="justify-content: flex-start; gap: 15px; margin-bottom: 5px;">
                    <button class="btn-volver" onclick="${btnVolverAccion}" title="Volver"><i data-lucide="arrow-left"></i></button>
                    <h2 style="margin:0;">Memorias de ${nombreTitulo}</h2>
                </div>

                <div id="seccion-musica" style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 5px solid #3b82f6;">
                    <div id="vista-musica-guardada" style="display: ${tieneMusica ? 'flex' : 'none'}; align-items: center; justify-content: space-between; gap: 10px;">
                        <a href="${objDestino.musica}" target="_blank" style="flex: 1; background: #3b82f6; color: white; text-decoration: none; padding: 12px; border-radius: 10px; font-weight: bold; text-align: center; display: flex; align-items: center; justify-content: center; gap: 10px;">
                            <i data-lucide="play-circle"></i> MÚSICA PARA LA MEMORIA
                        </a>
                        <button onclick="cambiarMusica('${idPais}', ${paramProv})" title="Cambiar enlace" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #64748b; padding: 12px; border-radius: 10px; cursor: pointer;">
                            <i data-lucide="refresh-cw" style="width:18px;"></i>
                        </button>
                    </div>
                    
                    <div id="input-musica" style="display: ${tieneMusica ? 'none' : 'flex'}; gap: 10px; align-items: center;">
                        <div style="flex:1; position:relative;">
                            <i data-lucide="music" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); width:14px; color:#94a3b8;"></i>
                            <input type="text" id="url-musica" placeholder="Pega el link de la canción..." style="width:100%; padding:10px 10px 10px 35px; border-radius:8px; border:1px solid #cbd5e1; font-size: 0.85rem; outline: none;">
                        </div>
                        <button onclick="guardarMusica('${idPais}', ${paramProv})" style="background: #3b82f6; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">Guardar</button>
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-bottom:20px;">
                    <button onclick="cambiarSubmodoRecuerdos('ver', '${idPais}', ${paramProv})" style="border:none; border-radius:12px; padding:10px 14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px; ${botonVerEstilo}">
                        <i data-lucide="eye" style="width:16px;"></i> Ver recuerdo
                    </button>
                    <button onclick="cambiarSubmodoRecuerdos('nuevo', '${idPais}', ${paramProv})" style="border:none; border-radius:12px; padding:10px 14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px; ${botonNuevoEstilo}">
                        <i data-lucide="plus-circle" style="width:16px;"></i> + Nuevo recuerdo
                    </button>
                </div>

                ${bloqueNuevo}

                <div id="lista-memorias-guardadas" style="display: ${submodoActual === 'nuevo' ? 'none' : 'grid'}; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
                </div>
            `;

            if (submodoActual === 'nuevo') {
                cambiarSeccionRecuerdos(seccionNuevo, idPais, idProvincia);
            } else {
                actualizarVistaRecuerdosSoloLectura(idPais, idProvincia);
            }
            lucide.createIcons();
        };

        window.cambiarSubmodoRecuerdos = function(submodo, idPais, idProvincia = null) {
            const destino = submodo === 'nuevo' ? 'nuevo' : 'ver';
            estadoVistaRecuerdos.submodo = destino;
            window.abrirAlbumDetalle(idPais, idProvincia, destino);
        };

        window.extraerIDYoutube = function(url) {
            const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
            const match = url.match(regExp);
            return (match && match[7].length === 11) ? match[7] : null;
        };

        window.guardarMusica = function(idPais, idProvincia = null) {
            const urlInput = document.getElementById('url-musica');
            const url = urlInput.value.trim();
            if (!url) return;
            if (!url.includes('youtube.com') && !url.includes('youtu.be')) { alert("Por favor, ingresa un enlace válido de YouTube."); return; }

            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            objDestino.musica = url;
            window.abrirAlbumDetalle(idPais, idProvincia); 
        };

        window.cambiarMusica = function(idPais, idProvincia = null) {
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            objDestino.musica = null;
            window.abrirAlbumDetalle(idPais, idProvincia);
        };

        window.cambiarSeccionRecuerdos = function(tipo, idPais, idProvincia = null) {
            if (estadoVistaRecuerdos.submodo !== 'nuevo') return;
            const btnDrive = document.getElementById('tab-drive');
            const btnHistorias = document.getElementById('tab-historias');
            const formDrive = document.getElementById('form-drive');
            const formHistorias = document.getElementById('form-historias');
            estadoVistaRecuerdos.seccionNuevo = tipo === 'historias' ? 'historias' : 'drive';

            if (tipo === 'drive') {
                btnDrive.style.background = 'var(--secondary)'; btnDrive.style.color = 'white';
                btnHistorias.style.background = 'transparent'; btnHistorias.style.color = '#546E7A';
                formDrive.style.display = 'block'; formHistorias.style.display = 'none';
            } else {
                btnHistorias.style.background = 'var(--primary)'; btnHistorias.style.color = 'white';
                btnDrive.style.background = 'transparent'; btnDrive.style.color = '#546E7A';
                formDrive.style.display = 'none'; formHistorias.style.display = 'block';
            }
            actualizarVistaAlbumes(idPais, idProvincia, tipo);
        };

        window.actualizarVistaRecuerdosSoloLectura = function(idPais, idProvincia = null) {
            const contenedor = document.getElementById('lista-memorias-guardadas');
            if (!contenedor) return;
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            const albumes = objDestino.albumes || [];
            const historias = objDestino.historias || [];
            const paramProv = idProvincia ? `'${idProvincia}'` : `null`;

            let html = '';
            if (albumes.length === 0 && historias.length === 0) {
                html = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><i data-lucide="camera-off" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i><p>Aún no hay recuerdos guardados para este destino.</p></div>';
            } else {
                albumes.forEach((album, index) => {
                    html += `
                        <div style="background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 5px solid var(--secondary);">
                            <div style="height:120px; background: #eee url('${album.portada || 'https://via.placeholder.com/300x150?text=Sin+Portada'}') center/cover no-repeat;"></div>
                            <div style="padding: 15px;">
                                <div style="display:flex; justify-content: space-between;">
                                    <h3 style="margin:0; font-size: 1rem;">${album.nombre}</h3>
                                    <button onclick="eliminarMemoria('${idPais}', ${paramProv}, ${index}, 'drive')" style="background:none; border:none; color: #EF5350; cursor:pointer;"><i data-lucide="trash-2" style="width:16px;"></i></button>
                                </div>
                                <a href="${album.url}" target="_blank" style="display:block; margin-top:15px; text-align:center; background:#DB4437; color:white; padding:10px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.8rem;">ABRIR DRIVE</a>
                            </div>
                        </div>`;
                });

                historias.forEach((h, index) => {
                    html += `
                        <div style="background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); display:flex; flex-direction:column;">
                            <div style="height:120px; background: #eee url('${h.img || 'https://via.placeholder.com/300x150?text=Sin+Imagen'}') center/cover no-repeat;"></div>
                            <div style="padding: 15px;">
                                <div style="display:flex; justify-content: space-between; align-items:center;">
                                    <h3 style="margin:0; font-size: 1rem; color: var(--primary);">${h.titulo}</h3>
                                    <button onclick="eliminarMemoria('${idPais}', ${paramProv}, ${index}, 'historia')" style="background:none; border:none; color: #EF5350; cursor:pointer;"><i data-lucide="trash-2" style="width:16px;"></i></button>
                                </div>
                                <p style="font-size: 0.85rem; color: #546E7A; margin-top:10px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${h.texto}</p>
                                <button onclick="leerHistoria('${idPais}', ${paramProv}, ${index})" style="width:100%; margin-top:10px; padding:8px; border-radius:8px; border:1px solid var(--primary); color:var(--primary); background:transparent; font-weight:bold; cursor:pointer;">Leer Completa</button>
                            </div>
                        </div>`;
                });
            }

            contenedor.innerHTML = html;
            lucide.createIcons();
        };

        window.actualizarVistaAlbumes = function(idPais, idProvincia = null, vista = 'drive') {
            const contenedor = document.getElementById('lista-memorias-guardadas');
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            contenedor.innerHTML = '';

            const paramProv = idProvincia ? `'${idProvincia}'` : `null`;

            if (vista === 'drive') {
                const albumes = objDestino.albumes || [];
                if (albumes.length === 0) {
                    contenedor.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><i data-lucide="folder-x" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i><p>No hay carpetas compartidas aún.</p></div>';
                } else {
                    albumes.forEach((album, index) => {
                        contenedor.innerHTML += `
                            <div style="background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 5px solid var(--secondary);">
                                <div style="height:120px; background: #eee url('${album.portada || 'https://via.placeholder.com/300x150?text=Sin+Portada'}') center/cover no-repeat;"></div>
                                <div style="padding: 15px;">
                                    <div style="display:flex; justify-content: space-between;">
                                        <h3 style="margin:0; font-size: 1rem;">${album.nombre}</h3>
                                        <button onclick="eliminarMemoria('${idPais}', ${paramProv}, ${index}, 'drive')" style="background:none; border:none; color: #EF5350; cursor:pointer;"><i data-lucide="trash-2" style="width:16px;"></i></button>
                                    </div>
                                    <a href="${album.url}" target="_blank" style="display:block; margin-top:15px; text-align:center; background:#DB4437; color:white; padding:10px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.8rem;">ABRIR DRIVE</a>
                                </div>
                            </div>`;
                    });
                }
            } else {
                const historias = objDestino.historias || [];
                if (historias.length === 0) {
                    contenedor.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><i data-lucide="scroll" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i><p>Aún no has escrito historias.</p></div>';
                } else {
                    historias.forEach((h, index) => {
                        contenedor.innerHTML += `
                            <div style="background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); display:flex; flex-direction:column;">
                                <div style="height:120px; background: #eee url('${h.img || 'https://via.placeholder.com/300x150?text=Sin+Imagen'}') center/cover no-repeat;"></div>
                                <div style="padding: 15px;">
                                    <div style="display:flex; justify-content: space-between; align-items:center;">
                                        <h3 style="margin:0; font-size: 1rem; color: var(--primary);">${h.titulo}</h3>
                                        <button onclick="eliminarMemoria('${idPais}', ${paramProv}, ${index}, 'historia')" style="background:none; border:none; color: #EF5350; cursor:pointer;"><i data-lucide="trash-2" style="width:16px;"></i></button>
                                    </div>
                                    <p style="font-size: 0.85rem; color: #546E7A; margin-top:10px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${h.texto}</p>
                                    <button onclick="leerHistoria('${idPais}', ${paramProv}, ${index})" style="width:100%; margin-top:10px; padding:8px; border-radius:8px; border:1px solid var(--primary); color:var(--primary); background:transparent; font-weight:bold; cursor:pointer;">Leer Completa</button>
                                </div>
                            </div>`;
                    });
                }
            }
            lucide.createIcons();
        };

        window.obtenerImagenPortada = function(idInputUrl, idInputArchivo) {
            const url = document.getElementById(idInputUrl)?.value?.trim() || '';
            const inputArchivo = document.getElementById(idInputArchivo);
            const archivo = inputArchivo && inputArchivo.files ? inputArchivo.files[0] : null;

            if (!archivo) return Promise.resolve(url);

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error("No se pudo leer el archivo de portada."));
                reader.readAsDataURL(archivo);
            });
        };

        window.agregarHistoria = async function(idPais, idProvincia = null) {
            const titulo = document.getElementById('titulo-historia').value.trim();
            const texto = document.getElementById('texto-historia').value.trim();
            if (!titulo || !texto) { alert("Tu historia necesita al menos un título y contenido."); return; }

            let img = '';
            try {
                img = await obtenerImagenPortada('img-historia', 'img-historia-file');
            } catch (error) {
                alert(error.message);
                return;
            }

            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            objDestino.historias.push({ titulo, img, texto, fecha: new Date().toLocaleDateString() });
            cambiarSeccionRecuerdos('historias', idPais, idProvincia);
        };

        window.leerHistoria = function(idPais, idProvincia = null, index) {
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            const h = objDestino.historias[index];
            const modal = document.createElement('div');
            modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;";
            modal.innerHTML = `
                <div style="background:white; width:100%; max-width:600px; max-height:90vh; border-radius:20px; overflow-y:auto; position:relative; padding-bottom:30px;">
                    <button onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:15px; right:15px; background:rgba(0,0,0,0.5); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-weight:bold; z-index:10;">X</button>
                    <div style="width:100%; height:250px; background:url('${h.img}') center/cover no-repeat;"></div>
                    <div style="padding:30px;">
                        <span style="color:var(--primary); font-weight:bold; font-size:0.8rem;">${h.fecha}</span>
                        <h2 style="margin-top:5px; color: #263238;">${h.titulo}</h2>
                        <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                        <p style="white-space: pre-wrap; line-height:1.6; color:#455A64;">${h.texto}</p>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        };

        window.eliminarMemoria = function(idPais, idProvincia = null, index, tipo) {
            if (confirm("¿Seguro que quieres borrar esto?")) {
                let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
                if (tipo === 'drive') {
                    objDestino.albumes.splice(index, 1);
                } else {
                    objDestino.historias.splice(index, 1);
                }

                if (estadoVistaRecuerdos.submodo === 'nuevo') {
                    const vistaActiva = estadoVistaRecuerdos.seccionNuevo || 'drive';
                    actualizarVistaAlbumes(idPais, idProvincia, vistaActiva);
                } else {
                    actualizarVistaRecuerdosSoloLectura(idPais, idProvincia);
                }
            }
        };

        window.agregarCarpetaDrive = async function(idPais, idProvincia = null) {
            const nombre = document.getElementById('nombre-carpeta-drive').value.trim();
            const url = document.getElementById('url-carpeta-drive').value.trim();
            if (!nombre || !url) { alert("Faltan datos."); return; }
            if (!url.includes('drive.google.com')) { alert("Link no válido."); return; }

            let portada = '';
            try {
                portada = await obtenerImagenPortada('portada-drive-url', 'portada-drive-file');
            } catch (error) {
                alert(error.message);
                return;
            }

            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            objDestino.albumes.push({ nombre, url, portada });
            actualizarVistaAlbumes(idPais, idProvincia, 'drive');
        };

        // Redirigimos la función huérfana para evitar errores con código viejo que tenías debajo
        window.abrirAlbumProvincia = function(countryId, provId) {
            window.abrirAlbumDetalle(countryId, provId);
        };
        // Función para borrar todo el país de la galería y del mapa
        window.borrarRecuerdoCompleto = function(idPais) {
            const confirmacion = confirm(`¿Estás seguro de que quieres borrar todos los recuerdos de ${paisesVisitados[idPais].nombre}? Esto eliminará el país del mapa y borrará todas tus historias y álbumes.`);

            if (confirmacion) {
                // Eliminar del objeto de estado
                delete paisesVisitados[idPais];

                // Actualizar el mapa visualmente (quitar clase CSS)
                d3.select(`.pais[id="${idPais}"]`).classed('visitado', false);

                // Volver a la lista general
                renderizarPantallaRecuerdos();
            }
        };

       function renderizarPantallaSonadosLegacy() {
            const contenedor = document.getElementById('vista-por-vivir');
            const idsPaises = Object.keys(destinosSonados);

            contenedor.innerHTML = `
                <div class="encabezado-seccion" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2><i data-lucide="heart"></i> Destinos por Vivir</h2>
                    <button class="btn-nueva-aventura" onclick="mostrarSelectorNuevoDestino()" style="background: var(--primary); color: white; border: none; padding: 10px 15px; border-radius: 20px; font-family: inherit; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(255, 64, 129, 0.3);">
                        <i data-lucide="plus-circle"></i> Nueva Aventura
                    </button>
                </div>
                <div id="selector-nuevo-destino" style="display:none; background: #FFF8F1; margin: 15px; padding: 20px; border-radius: 15px; border: 2px dashed var(--primary); animation: fadeIn 0.3s ease;">
                    <h3 style="margin-top:0; color: var(--primary);">¿A dónde quieres ir?</h3>
                    <p style="font-size: 0.9rem; color: #607D8B;">Selecciona tu destino final para empezar a planear:</p>
                    <select id="select-pais-nuevo" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #CFD8DC; margin-bottom: 15px; font-family: inherit; font-size: 1rem; background: white;">
                        <option value="" disabled selected>Cargando países...</option>
                    </select>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="confirmarNuevoDestino()" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #4CAF50; color: white; font-weight: bold; cursor: pointer;">Crear Aventura</button>
                        <button onclick="document.getElementById('selector-nuevo-destino').style.display='none'" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #ECEFF1; color: #546E7A; font-weight: bold; cursor: pointer;">Cancelar</button>
                    </div>
                </div>
                <div class="contenedor-scroll" id="scroll-sonados"></div>
            `;

            const scrollArea = document.getElementById('scroll-sonados');

            // Cargar países dinámicamente desde los datos del mapa (D3)
            setTimeout(() => {
                const select = document.getElementById('select-pais-nuevo');
                if (select) {
                    const paisesMapa = d3.selectAll('.pais').data();

                    if (paisesMapa && paisesMapa.length > 0) {
                        select.innerHTML = '<option value="" disabled selected>Elige un país...</option>';
                        const listaOrdenada = paisesMapa
                            .map(d => ({ id: d.id, nombre: d.properties.name }))
                            .sort((a, b) => a.nombre.localeCompare(b.nombre));

                        listaOrdenada.forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p.id;
                            opt.textContent = p.nombre;
                            select.appendChild(opt);
                        });
                    } else {
                        select.innerHTML = '<option value="" disabled selected>Error cargando mapa...</option>';
                    }
                }
            }, 100);

            if (idsPaises.length === 0) {
                scrollArea.innerHTML = `
                    <div class="mensaje-vacio">
                        <i data-lucide="compass"></i>
                        <p>No tienes aventuras planeadas todavía.</p>
                        <p style="font-size: 1rem; font-weight: 500;">Haz clic en "Nueva Aventura" o elige un país en el mapa.</p>
                    </div>
                `;
            } else {
                const listaHTML = document.createElement('div');
                listaHTML.className = 'lista-paises';

                idsPaises.forEach(id => {
    const pais = paisesVisitados[id];
    const numMemorias = contarMemoriasPais(id);

    let provinciasHTML = "";

    if(provinciasVisitadas[id]){
        const provs = Object.keys(provinciasVisitadas[id]);

        provinciasHTML = `
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
            ${provs.map(pid=>{
                const prov = provinciasVisitadas[id][pid];
                return `<button onclick="abrirAlbumProvincia('${id}','${pid}')" 
                style="background:none;border:none;color:#546E7A;font-weight:700;text-align:left;cursor:pointer;">
                📍 ${prov.nombre || pid}
                </button>`;
            }).join("")}
        </div>`;
    }

    listaHTML.innerHTML += `
        <div class="tarjeta-pais">
            <div class="info-pais">
                <div class="icono-bandera"><i data-lucide="map-pin"></i></div>
                <div>
                    <h3 class="nombre-pais-lista">${pais.nombre}</h3>
                    <span class="zonas-badge">${numMemorias} memorias</span>
                    ${provinciasHTML}
                </div>
            </div>
            <button class="btn-accion-pais" onclick="abrirAlbum('${id}')">
                Ver Álbumes <i data-lucide="chevron-right"></i>
            </button>
        </div>`;
});
                scrollArea.appendChild(listaHTML);
            }
            lucide.createIcons();
        }
        window.abrirAlbumProvincia = function(countryId, provId){
    // Si no existe ese país en memoria, abortar
    if(!provinciasVisitadas[countryId] || !provinciasVisitadas[countryId][provId]){
        alert("No hay recuerdos para esta provincia.");
        return;
    }

    const prov = provinciasVisitadas[countryId][provId];

    const scrollArea = document.getElementById('scroll-recuerdos');

    // Cabecera específica de provincia
    scrollArea.innerHTML = `
        <div class="cabecera-detalle" style="justify-content: flex-start; gap: 15px; margin-bottom: 5px;">
            <button class="btn-volver" onclick="abrirAlbum('${countryId}')" title="Volver"><i data-lucide="arrow-left"></i></button>
            <h2 style="margin:0;">Memorias de ${prov.nombre || provId} — ${ (paisesVisitados[countryId] && paisesVisitados[countryId].nombre) || '' }</h2>
        </div>

        <div class="contenedor-scroll" style="padding-top:10px;">
            <div style="padding:20px; background:#fff; border-radius:12px;">
                <p style="color:#546E7A; font-weight:700;">Aquí se mostrarán álbumes e historias guardadas para esta provincia.</p>
            </div>
        </div>
    `;
    lucide.createIcons();
};

        window.mostrarSelectorNuevoDestino = function() {
            const el = document.getElementById('selector-nuevo-destino');
            el.style.display = 'block';
            el.scrollIntoView({ behavior: 'smooth' });
        };

        window.confirmarNuevoDestino = function() {
            const select = document.getElementById('select-pais-nuevo');
            const selectCiudad = document.getElementById('select-ciudad-aventura');
            const id = select.value;
            const nombre = select.options[select.selectedIndex].text;
            const ciudadSeleccionada = selectCiudad ? (selectCiudad.value || '') : '';

            if (!id || id === "") return;

            // Ocultar el panel de selección para que no estorbe
            document.getElementById('selector-nuevo-destino').style.display = 'none';

            if (!destinosSonados[id]) {
                destinosSonados[id] = {
                    nombre: nombre,
                    destinoFinal: nombre,
                    ciudadDestinoFinal: ciudadSeleccionada ? ciudadSeleccionada.toUpperCase() : '',
                    escalas: [],
                    escalasCiudades: ciudadSeleccionada ? [ciudadSeleccionada.toUpperCase()] : [],
                    itinerario: [],
                    dias: [crearDia(1, 'Llegada')]
                };

                // Pintar el mapa
                d3.select(`.pais[id="${id}"]`).classed('sonado', true);
            } else if (ciudadSeleccionada) {
                const ciudadNormalizada = ciudadSeleccionada.toUpperCase();
                destinosSonados[id].ciudadDestinoFinal = ciudadNormalizada;
                if (!destinosSonados[id].escalasCiudades) destinosSonados[id].escalasCiudades = [];
                if (!destinosSonados[id].escalasCiudades.includes(ciudadNormalizada)) destinosSonados[id].escalasCiudades.push(ciudadNormalizada);
            }

            abrirPlanificador(id);
        };

        window.abrirPlanificador = function(idPais) {
            estadoVistaSonados = { modo: 'detalle', idPais };
            normalizarDestinosSonados();
            const pais = destinosSonados[idPais];
            const scrollArea = document.getElementById('scroll-sonados');
            if (!pais || !scrollArea) {
                renderizarPantallaSonados();
                return;
            }
            estadoVistaSonados = { modo: 'detalle', idPais };

            const nombrePrincipal = obtenerNombreCabeceraDestino(pais);
            const escalasResumen = obtenerResumenEscalas(pais);
            const portadaActual = pais.portadaUrl || "";
            const mostrarEditorPortada = Object.prototype.hasOwnProperty.call(estadoEdicionPortadaItinerario, idPais)
                ? Boolean(estadoEdicionPortadaItinerario[idPais])
                : !portadaActual;
            estadoVistaItinerario = { modo: 'lista', idPais };

            scrollArea.innerHTML = `
                <div class="cabecera-detalle">
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <button class="btn-volver" onclick="renderizarPantallaSonados()" title="Volver a la lista">
                            <i data-lucide="arrow-left"></i>
                        </button>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom: 4px;">
                                <span style="font-size: 1.6rem; font-weight: 900; color:#FF4081;">ITINERARIO:</span>
                                <h2 class="destino-principal rosa" style="margin:0;">${nombrePrincipal}</h2>
                                <span style="font-size: 1.4rem;">🌍</span>
                            </div>
                            ${escalasResumen ? `<div class="destino-escalas">(${escalasResumen})</div>` : ''}
                        </div>
                    </div>
                    
                    <button id="btn-borrar-iti" class="btn-borrar-itinerario" onclick="borrarItinerarioCompleto('${idPais}')" data-confirm="false" title="Eliminar todo el itinerario de este país">
                        <i data-lucide="trash-2"></i> Borrar Todo
                    </button>
                </div>
                
                <div class="panel-creacion">
                    <div class="portada-itinerario-wrap">
                        <img class="portada-itinerario-preview" src="${portadaActual || 'https://via.placeholder.com/240x150?text=Sin+Portada'}" alt="Portada del itinerario">
                        ${mostrarEditorPortada ? `
                            <div style="display:flex; gap:10px; flex:1; min-width: 240px;">
                                <input type="url" id="input-portada-itinerario" placeholder="URL de portada del itinerario..." value="${portadaActual}" style="flex:1; padding:10px 12px; border-radius:10px; border:2px solid #F8BBD0; font-family: inherit;">
                                <button class="btn-tipo-item" style="border-color:#F48FB1; color:#D81B60;" onclick="guardarPortadaItinerario('${idPais}')"><i data-lucide="image-plus"></i> Guardar portada</button>
                            </div>
                        ` : `
                            <div class="acciones-portada-itinerario">
                                <button class="btn-editar-portada" onclick="activarEdicionPortadaItinerario('${idPais}')" title="Editar portada">
                                    <i data-lucide="pencil"></i>
                                </button>
                            </div>
                        `}
                    </div>
                    <h3 style="margin-top:0; color: #455A64;">Agregar nuevo paso:</h3>
                    <div class="botones-tipos">
                        <button class="btn-tipo-item" onclick="mostrarFormularioItinerario('viaje', this)"><i data-lucide="bus"></i> Viaje</button>
                        <button class="btn-tipo-item" onclick="manual_Hospedaje(this)"><i data-lucide="hotel"></i> Hospedaje</button>
                        <button class="btn-tipo-item" onclick="manual_Aventura(this)"><i data-lucide="mountain"></i> Aventura</button>
                        <button class="btn-tipo-item" onclick="manual_Restaurante(this)"><i data-lucide="utensils"></i> Restaurante</button>
                    </div>
                    <div id="contenedor-formularios"></div>
                </div>

                <div class="selector-modo-itinerario">
                    <button id="btn-modo-lista-${idPais}" class="btn-modo-itinerario activo" onclick="cambiarModoItinerario('lista')">Modo Lista</button>
                    <button id="btn-modo-calendario-${idPais}" class="btn-modo-itinerario" onclick="cambiarModoItinerario('calendario')">Modo Calendario</button>
                </div>

                <div class="linea-tiempo" id="linea-tiempo-${idPais}"></div>
                <div class="calendario-itinerario" id="calendario-itinerario-${idPais}" style="display:none;"></div>
            `;

            lucide.createIcons();
            dibujarItinerario(idPais);
            cambiarModoItinerario('lista');
        };

        window.cambiarModoItinerario = function(modo) {
            const modoNormalizado = modo === 'calendario' ? 'calendario' : 'lista';
            const { idPais } = estadoVistaItinerario;
            if (!idPais) return;

            estadoVistaItinerario.modo = modoNormalizado;
            dibujarItinerario(idPais);

            const btnLista = document.getElementById(`btn-modo-lista-${idPais}`);
            const btnCalendario = document.getElementById(`btn-modo-calendario-${idPais}`);
            const lineaTiempo = document.getElementById(`linea-tiempo-${idPais}`);
            const calendario = document.getElementById(`calendario-itinerario-${idPais}`);

            if (!btnLista || !btnCalendario || !lineaTiempo || !calendario) return;

            const esLista = modoNormalizado === 'lista';
            btnLista.classList.toggle('activo', esLista);
            btnCalendario.classList.toggle('activo', !esLista);
            lineaTiempo.style.display = esLista ? 'block' : 'none';
            calendario.style.display = esLista ? 'none' : 'grid';

            if (!esLista) {
                renderizarCalendarioItinerario(idPais);
            }
        };

        function normalizarDiaItinerario(dia) {
            const texto = (dia || '').toString().trim();
            if (!texto) {
                return { etiqueta: 'Día 1', orden: 1 };
            }
            const sinAcentos = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const matchDia = sinAcentos.match(/dia\s*(\d+)/i);
            if (matchDia) {
                const nroDia = Number(matchDia[1]);
                return { etiqueta: `Día ${nroDia}`, orden: nroDia };
            }
            return { etiqueta: texto, orden: Number.MAX_SAFE_INTEGER - 1 };
        }

        function obtenerMinutosHorario(item) {
            if (typeof item?._horaOrden === 'string') {
                const matchOrden = item._horaOrden.trim().match(/^(\d{1,2}):(\d{2})$/);
                if (matchOrden) {
                    const horasOrden = Number(matchOrden[1]);
                    const minutosOrden = Number(matchOrden[2]);
                    if (!Number.isNaN(horasOrden) && !Number.isNaN(minutosOrden)) {
                        return (horasOrden * 60) + minutosOrden;
                    }
                }
            }
            const candidatos = [item?.llegada, item?.partida];
            for (const horario of candidatos) {
                if (typeof horario !== 'string') continue;
                const match = horario.trim().match(/^(\d{1,2}):(\d{2})$/);
                if (!match) continue;
                const horas = Number(match[1]);
                const minutos = Number(match[2]);
                if (Number.isNaN(horas) || Number.isNaN(minutos)) continue;
                return (horas * 60) + minutos;
            }
            return Number.POSITIVE_INFINITY;
        }

        function normalizarHoraItinerario(valor = '') {
            if (typeof valor !== 'string') return '';
            const texto = valor.trim();
            const match = texto.match(/^(\d{1,2}):(\d{2})$/);
            if (!match) return '';
            const horas = Number(match[1]);
            const minutos = Number(match[2]);
            if (Number.isNaN(horas) || Number.isNaN(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
                return '';
            }
            return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
        }

        function formatearHorarioItinerario(llegada = '', partida = '') {
            const llegadaNormalizada = normalizarHoraItinerario(llegada);
            const partidaNormalizada = normalizarHoraItinerario(partida);
            if (!llegadaNormalizada && !partidaNormalizada) return 'Sin horario';
            if (llegadaNormalizada && partidaNormalizada) return `${llegadaNormalizada} - ${partidaNormalizada}`;
            return llegadaNormalizada || partidaNormalizada;
        }

        function obtenerFechaCheckoutHospedaje(item = {}, fechaCheckin = '') {
            const fechaCheckoutExplicita = String(item?.fechaCheckout || '').trim();
            if (esFechaActividadValida(fechaCheckoutExplicita)) return fechaCheckoutExplicita;

            if (!esFechaActividadValida(fechaCheckin)) return '';
            const noches = Math.max(0, Number(item?.noches) || 0);
            if (!noches) return fechaCheckin;
            return sumarDiasAFechaISO(fechaCheckin, noches);
        }

        function obtenerFechaBaseItem(destino, item = {}) {
            const fechaItem = String(item.fechaActividad || '').trim();
            if (esFechaActividadValida(fechaItem)) return fechaItem;
            const dia = obtenerDiaDeItem(destino, item);
            if (dia && esFechaActividadValida(dia.fecha)) return dia.fecha;
            return '';
        }

        function obtenerRangoTemporalItem(destino, item = {}) {
            const fechaInicio = obtenerFechaBaseItem(destino, item);
            const horaInicio = normalizarHoraItinerario(item.llegada);
            const horaFin = normalizarHoraItinerario(item.partida);
            let fechaFin = fechaInicio;

            if (item.tipo === 'hospedaje') {
                fechaFin = obtenerFechaCheckoutHospedaje(item, fechaInicio) || fechaInicio;
            } else if (fechaInicio && horaInicio && horaFin && horaFin < horaInicio) {
                fechaFin = sumarDiasAFechaISO(fechaInicio, 1);
            }

            return { fechaInicio, fechaFin, horaInicio, horaFin };
        }

        function formatearRangoTemporalItem(destino, item = {}) {
            const { fechaInicio, fechaFin, horaInicio, horaFin } = obtenerRangoTemporalItem(destino, item);
            const horarioSimple = formatearHorarioItinerario(item.llegada, item.partida);
            const fechaInicioFormateada = formatearFechaCortaItinerario(fechaInicio);
            const fechaFinFormateada = formatearFechaCortaItinerario(fechaFin);

            if (!fechaInicioFormateada) return horarioSimple;
            if (!horaInicio && !horaFin) return `${fechaInicioFormateada}`;
            if (!horaInicio || !horaFin || fechaInicio === fechaFin) return `${horarioSimple} (${fechaInicioFormateada})`;
            return `${horaInicio} (${fechaInicioFormateada}) → ${horaFin} (${fechaFinFormateada || fechaInicioFormateada})`;
        }

        function obtenerMetaItinerario(item = {}, destino = null) {
            if (item._esCheckoutVirtual) {
                const horaCheckout = normalizarHoraItinerario(item.partida) || 'Sin horario';
                return {
                    icono: 'hotel',
                    titulo: 'Hotel',
                    detalle: item.hotel || 'Sin nombre de hotel',
                    horario: `Check-out: ${horaCheckout}`
                };
            }

            const horario = formatearRangoTemporalItem(destino, item);
            if (item.tipo === 'viaje') {
                return {
                    icono: 'bus',
                    titulo: `Viaje en ${item.medio || 'transporte'}`,
                    detalle: `Escala: ${item.destino || 'Sin destino'}${item.ciudad ? `, ${item.ciudad}` : ''}`,
                    horario
                };
            }
            if (item.tipo === 'hospedaje') {
                const horaCheckin = normalizarHoraItinerario(item.llegada) || 'Sin horario';
                return {
                    icono: 'hotel',
                    titulo: 'Hotel',
                    detalle: item.hotel || 'Sin nombre de hotel',
                    horario: `Check-in: ${horaCheckin}`
                };
            }
            if (item.tipo === 'aventura') {
                return {
                    icono: 'mountain',
                    titulo: item.lugar || 'Aventura',
                    detalle: `Costo: $${item.costo || '0'}`,
                    horario
                };
            }
            if (item.tipo === 'restaurante') {
                return {
                    icono: 'utensils',
                    titulo: item.plato || 'Restaurante',
                    detalle: `Gasto estimado: $${item.precio || '0'}`,
                    horario
                };
            }
            return {
                icono: 'circle',
                titulo: item.tipo || 'Actividad',
                detalle: '',
                horario
            };
        }

        let limpiarMenuContextualItinerario = null;

        function cerrarMenuContextualItinerario() {
            const menu = document.getElementById('menu-contextual');
            if (!menu) return;

            menu.classList.remove('menu-visible', 'menu-itinerario');
            menu.classList.add('menu-oculto');
            menu.innerHTML = '';

            if (typeof limpiarMenuContextualItinerario === 'function') {
                limpiarMenuContextualItinerario();
                limpiarMenuContextualItinerario = null;
            }
        }

        function abrirMenuContextualItinerario(event, idPais, idItem) {
            event.preventDefault();
            event.stopPropagation();

            const destino = destinosSonados[idPais];
            if (!destino || !Array.isArray(destino.itinerario)) return;
            const item = destino.itinerario.find(i => Number(i.id) === Number(idItem));
            if (!item) return;

            const menu = document.getElementById('menu-contextual');
            if (!menu) return;

            const tituloItem = item.lugar || item.hotel || item.plato || `Viaje en ${item.medio || 'transporte'}`;
            cerrarMenuContextualItinerario();

            menu.classList.add('menu-itinerario');
            menu.innerHTML = `
                <div class="menu-header">
                    <h3 class="menu-titulo">${tituloItem}</h3>
                    <button id="cerrar-menu-itinerario" class="btn-cerrar-menu" type="button">&times;</button>
                </div>
                <ul class="opciones-menu">
                    <li id="opc-itinerario-editar"><i data-lucide="pencil"></i> Editar</li>
                    <li id="opc-itinerario-eliminar" class="opcion-peligro"><i data-lucide="trash-2"></i> Eliminar</li>
                </ul>
            `;
            lucide.createIcons();

            menu.classList.remove('menu-oculto');
            menu.classList.add('menu-visible');

            const margen = 12;
            const ancho = menu.offsetWidth || 250;
            const alto = menu.offsetHeight || 180;
            const maxX = window.scrollX + window.innerWidth - ancho - margen;
            const maxY = window.scrollY + window.innerHeight - alto - margen;
            const posX = Math.max(window.scrollX + margen, Math.min(event.pageX, maxX));
            const posY = Math.max(window.scrollY + margen, Math.min(event.pageY, maxY));

            menu.style.left = `${posX}px`;
            menu.style.top = `${posY}px`;

            document.getElementById('opc-itinerario-editar')?.addEventListener('click', () => {
                cerrarMenuContextualItinerario();
                editarItemItinerario(idPais, idItem);
            });
            document.getElementById('opc-itinerario-eliminar')?.addEventListener('click', () => {
                const confirmar = window.confirm('¿Seguro que quieres eliminar este ítem del itinerario?');
                if (!confirmar) return;
                cerrarMenuContextualItinerario();
                eliminarItemItinerario(idPais, idItem);
            });
            document.getElementById('cerrar-menu-itinerario')?.addEventListener('click', cerrarMenuContextualItinerario);

            const manejarClickFuera = (ev) => {
                if (!menu.contains(ev.target)) cerrarMenuContextualItinerario();
            };
            const manejarEscape = (ev) => {
                if (ev.key === 'Escape') cerrarMenuContextualItinerario();
            };

            document.addEventListener('mousedown', manejarClickFuera);
            document.addEventListener('keydown', manejarEscape);
            limpiarMenuContextualItinerario = () => {
                document.removeEventListener('mousedown', manejarClickFuera);
                document.removeEventListener('keydown', manejarEscape);
            };
        }

        function vincularMenuContextualItinerario(idPais, contenedor) {
            if (!contenedor) return;
            const elementos = contenedor.querySelectorAll('[data-itinerario-item-id]');
            elementos.forEach((elemento) => {
                elemento.addEventListener('contextmenu', (event) => {
                    abrirMenuContextualItinerario(event, idPais, elemento.dataset.itinerarioItemId);
                });
            });
        }

        window.renderizarCalendarioItinerario = function(idPais) {
            const calendario = document.getElementById(`calendario-itinerario-${idPais}`);
            const destino = destinosSonados[idPais];
            if (!calendario || !destino) return;

            derivarDiasDesdeFechasItinerario(destino);
            const items = Array.isArray(destino.itinerario) ? destino.itinerario : [];
            const dias = Array.isArray(destino.dias) ? destino.dias : [];
            calendario.innerHTML = '';

            if (items.length === 0 && dias.length === 0) {
                calendario.innerHTML = `<div class="calendario-vacio">No hay actividades para mostrar.</div>`;
                lucide.createIcons();
                return;
            }

            const grupos = new Map();
            dias.forEach(dia => {
                grupos.set(dia.id, { ...dia, items: [] });
            });

            const diaPorFecha = new Map();
            dias.forEach((dia) => {
                if (esFechaActividadValida(dia?.fecha)) {
                    diaPorFecha.set(dia.fecha, dia);
                }
            });

            const agregarItemEnDia = (diaDestino, item, indiceCreacion, extras = {}) => {
                if (!diaDestino) return;
                const diaNormalizado = normalizarDiaItinerario(`Día ${diaDestino.numero || 1}`);
                const fechaDia = formatearFechaCortaItinerario(diaDestino?.fecha);
                const etiqueta = `DÍA ${diaDestino.numero || 1}${fechaDia ? ` (${fechaDia})` : ''}: ${diaDestino.nombre || diaNormalizado.etiqueta}`;
                const clave = diaDestino?.id || `sin-dia-${diaNormalizado.orden}`;

                if (!grupos.has(clave)) {
                    grupos.set(clave, {
                        ...diaDestino,
                        etiqueta,
                        orden: diaDestino?.numero || diaNormalizado.orden,
                        items: []
                    });
                }
                grupos.get(clave).items.push({ ...item, _ordenCreacion: indiceCreacion, ...extras });
            };

            items.forEach((item, indiceCreacion) => {
                const diaInicio = obtenerDiaDeItem(destino, item);
                agregarItemEnDia(diaInicio, item, indiceCreacion, { _horaOrden: item?.llegada || item?.partida || '' });

                const { fechaFin, horaFin } = obtenerRangoTemporalItem(destino, item);
                if (!esFechaActividadValida(fechaFin)) return;

                const diaFin = diaPorFecha.get(fechaFin);
                if (!diaFin) return;

                if (item?.tipo === 'hospedaje') {
                    agregarItemEnDia(diaFin, item, indiceCreacion, {
                        _horaOrden: horaFin || item?.partida || '',
                        _esCheckoutVirtual: true
                    });
                    return;
                }

                if (diaInicio?.id === diaFin.id) return;
                agregarItemEnDia(diaFin, item, indiceCreacion, { _horaOrden: horaFin || item?.partida || item?.llegada || '' });
            });

            const columnas = Array.from(grupos.values())
                .sort((a, b) => (a.numero || 0) - (b.numero || 0))
                .map(dia => {
                    const itemsDia = Array.isArray(dia.items) ? dia.items : [];
                    const nombreDia = (dia.nombre || `Día ${dia.numero || 1}`).trim();
                    const fechaDia = formatearFechaCortaItinerario(dia.fecha);
                    itemsDia.sort((a, b) => {
                        const minutosA = obtenerMinutosHorario(a);
                        const minutosB = obtenerMinutosHorario(b);
                        if (minutosA !== minutosB) return minutosA - minutosB;
                        return a._ordenCreacion - b._ordenCreacion;
                    });

                    const tarjetas = itemsDia.map(item => {
                        const meta = obtenerMetaItinerario(item, destino);
                        return `
                            <article class="tarjeta-calendario-itinerario ${item.tipo || ''}" data-itinerario-item-id="${item.id}">
                                <div class="tarjeta-calendario-header">
                                    <h4><i data-lucide="${meta.icono}"></i> ${meta.titulo}</h4>
                                    <span class="badge-horario"><i data-lucide="clock-3"></i> ${meta.horario}</span>
                                </div>
                                <p>${meta.detalle || 'Sin detalle.'}</p>
                            </article>
                        `;
                    }).join('');

                    return `
                        <section class="columna-dia-itinerario">
                            <header class="cabecera-columna-dia-itinerario">
                                <div class="cabecera-dia-contenido">
                                    <span class="cabecera-dia-numero">Día ${dia.numero || 1}${fechaDia ? ` <span class="cabecera-dia-fecha">(${fechaDia})</span>` : ''}</span>
                                    <span class="cabecera-dia-nombre">${nombreDia}</span>
                                </div>
                                <button class="btn-editar-dia-calendario" onclick="editarNombreDia('${idPais}', '${dia.id}')" title="Editar nombre del día">
                                    <i data-lucide="pencil"></i>
                                </button>
                            </header>
                            <div class="columna-dia-lista">${tarjetas || '<div class="estado-dia-vacio">Sin actividades para este día.</div>'}</div>
                        </section>
                    `;
                }).join('');

            calendario.innerHTML = columnas;
            lucide.createIcons();
            vincularMenuContextualItinerario(idPais, calendario);
        };

        window.editarNombreDia = function(idPais, diaId) {
            const destino = destinosSonados[idPais];
            if (!destino || !Array.isArray(destino.dias)) return;

            const dia = destino.dias.find(d => d.id === diaId);
            if (!dia) return;

            const nombreActual = (dia.nombre || '').trim() || `Día ${dia.numero || 1}`;
            const nuevoNombre = window.prompt(`Nombre para Día ${dia.numero}:`, nombreActual);
            if (nuevoNombre === null) return;

            const nombreLimpio = nuevoNombre.trim();
            dia.nombre = nombreLimpio || `Día ${dia.numero || 1}`;
            sincronizacionLocalEnCurso = true;
            dibujarItinerario(idPais);
        };

        window.manual_Hospedaje = (btn) => mostrarFormularioItinerario('hospedaje', btn);
        window.manual_Aventura = (btn) => mostrarFormularioItinerario('aventura', btn);
        window.manual_Restaurante = (btn) => mostrarFormularioItinerario('restaurante', btn);

        function obtenerNombreCabeceraDestino(pais) {
            const nombreCiudad = (pais.ciudadDestinoFinal || "").toUpperCase();
            const nombrePais = (pais.destinoFinal || pais.nombre || "Destino").toUpperCase();
            return nombreCiudad ? `${nombreCiudad}, ${nombrePais}` : nombrePais;
        }

        function obtenerResumenEscalas(pais) {
            const viajes = Array.isArray(pais.itinerario) ? pais.itinerario.filter(item => item && item.tipo === 'viaje') : [];
            const paisesConCiudades = new Map();

            viajes.forEach(viaje => {
                const nombrePais = (viaje.destino || '').trim();
                const nombreCiudad = (viaje.ciudad || '').trim();
                if (!nombrePais || !nombreCiudad) return;

                if (!paisesConCiudades.has(nombrePais)) paisesConCiudades.set(nombrePais, new Set());
                paisesConCiudades.get(nombrePais).add(nombreCiudad);
            });

            return Array.from(paisesConCiudades.entries())
                .map(([nombrePais, ciudades]) => ciudades.size > 1 ? nombrePais.toUpperCase() : Array.from(ciudades)[0].toUpperCase())
                .join(', ');
        }

        window.cargarCiudadesEscalaViaje = function() {
            const selectPais = document.getElementById('input-viaje-destino');
            const contenedorCiudad = document.getElementById('campo-viaje-ciudad');
            const selectCiudad = document.getElementById('input-viaje-ciudad');

            if (!selectPais || !contenedorCiudad || !selectCiudad) return;

            const idPaisEscala = selectPais.value;
            if (!idPaisEscala) {
                contenedorCiudad.style.display = 'none';
                selectCiudad.innerHTML = '<option value="" disabled selected>Selecciona una ciudad...</option>';
                return;
            }

            const nombrePais = selectPais.options[selectPais.selectedIndex]?.text || "";
            contenedorCiudad.style.display = 'block';
            selectCiudad.innerHTML = '<option value="" disabled selected>Cargando ciudades...</option>';

            d3.json(ESTADOS_PROVINCIAS_URL).then(data => {
                const ciudades = data.features
                    .filter(f => provinciaPerteneceAPais(f, nombrePais, idPaisEscala))

                    .map(f => f.properties.name || f.properties.name_en || "")
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));

                const unicas = [...new Set(ciudades)];
                if (unicas.length === 0) {
                    selectCiudad.innerHTML = '<option value="" disabled selected>No encontramos ciudades para este país</option>';
                    return;
                }

                selectCiudad.innerHTML = '<option value="" disabled selected>Selecciona una ciudad...</option>';
                unicas.forEach(ciudad => {
                    const opt = document.createElement('option');
                    opt.value = ciudad;
                    opt.textContent = ciudad;
                    selectCiudad.appendChild(opt);
                });
            }).catch(() => {
                selectCiudad.innerHTML = '<option value="" disabled selected>No se pudieron cargar ciudades</option>';
            });
        };

        window.borrarItinerarioCompleto = function(idPais) {
            const btn = document.getElementById('btn-borrar-iti');
            if (btn.dataset.confirm === 'true') {
                delete destinosSonados[idPais];
                d3.selectAll('.pais').classed('sonado', function(d) { return destinosSonados[d.id] ? true : false; });
                renderizarPantallaSonados();
            } else {
                btn.dataset.confirm = 'true';
                btn.innerHTML = '<i data-lucide="alert-triangle"></i> ¿Seguro?';
                btn.style.background = '#F44336';
                btn.style.color = 'white';
                lucide.createIcons();
                setTimeout(() => {
                    if(document.getElementById('btn-borrar-iti')) {
                        btn.dataset.confirm = 'false';
                        btn.innerHTML = '<i data-lucide="trash-2"></i> Borrar Todo';
                        btn.style.background = '#FFEBEE';
                        btn.style.color = '#F44336';
                        lucide.createIcons();
                    }
                }, 3000);
            }
        };

        window.mostrarFormularioItinerario = function(tipo, btn, config = {}) {
            document.querySelectorAll('.btn-tipo-item').forEach(b => b.classList.remove('seleccionado'));
            if (btn) btn.classList.add('seleccionado');

            const contenedor = document.getElementById('contenedor-formularios');
            const itemExistente = config.item || null;
            const esEdicion = Boolean(itemExistente);
            const idPais = document.querySelector('.linea-tiempo').id.replace('linea-tiempo-', '');
            const destino = destinosSonados[idPais];
            const fechaActual = itemExistente?.fechaActividad || '';
            let formHTML = `<div class="formulario-itinerario activo" id="form-${tipo}">`;

            if (tipo === 'viaje') {
                const paisesMapa = d3.selectAll('.pais').data();
                const paisesSelect = paisesMapa
                    .map(d => ({ id: d.id, nombre: d.properties.name }))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map(p => `<option value="${p.id}" ${itemExistente?.destinoId === p.id ? 'selected' : ''}>${p.nombre}</option>` )
                    .join('');
                const horas = itemExistente?.horas || '';
                const minutos = itemExistente?.minutos || '';
                const costo = itemExistente?.costo || '';

                formHTML += `
                    <div class="campo-form"><label>Medio de transporte</label>
                        <select id="input-viaje-medio"><option value="Micro" ${itemExistente?.medio === 'Micro' ? 'selected' : ''}>🚌 Micro / Autobús</option><option value="Auto" ${itemExistente?.medio === 'Auto' ? 'selected' : ''}>🚗 Auto / Alquiler</option><option value="Avión" ${itemExistente?.medio === 'Avión' ? 'selected' : ''}>✈️ Avión</option><option value="Tren" ${itemExistente?.medio === 'Tren' ? 'selected' : ''}>🚂 Tren</option></select>
                    </div>
                    <div class="campo-form"><label>País de Escala</label>
                        <select id="input-viaje-destino" onchange="cargarCiudadesEscalaViaje()"><option value="" disabled ${!itemExistente?.destinoId ? 'selected' : ''}>Selecciona un país...</option>${paisesSelect}</select>
                    </div>
                    <div class="campo-form" id="campo-viaje-ciudad" style="display:none;"><label>Ciudad de Escala</label>
                        <select id="input-viaje-ciudad"><option value="" disabled selected>Selecciona una ciudad...</option></select>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Horas</label><input type="number" id="input-viaje-horas" placeholder="0" value="${horas}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Minutos</label><input type="number" id="input-viaje-minutos" placeholder="0" value="${minutos}"></div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada</label><input type="time" id="input-viaje-llegada" value="${itemExistente?.llegada || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida</label><input type="time" id="input-viaje-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                    <div class="campo-form"><label>Costo Pasaje ($)</label><input type="number" id="input-viaje-costo" placeholder="Ej. 150000" value="${costo}"></div>
                `;
            } else if (tipo === 'hospedaje') {
                const fechaCheckoutExistente = itemExistente?.fechaCheckout || obtenerFechaCheckoutHospedaje(itemExistente, fechaActual);
                formHTML += `
                    <div class="campo-form"><label>Nombre del Hotel</label><input type="text" id="input-hospedaje-nombre" placeholder="Ej. Hotel Copacabana" value="${itemExistente?.hotel || ''}"></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Noches</label><input type="number" id="input-hospedaje-noches" placeholder="Ej. 5" value="${itemExistente?.noches || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Precio Total ($)</label><input type="number" id="input-hospedaje-costo" placeholder="Ej. 80000" value="${itemExistente?.costo || ''}"></div>
                    </div>
                    <div class="campo-form"><label>Fecha de check-out</label><input type="date" id="input-hospedaje-checkout" value="${fechaCheckoutExistente || ''}"></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada</label><input type="time" id="input-hospedaje-llegada" value="${itemExistente?.llegada || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida</label><input type="time" id="input-hospedaje-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                `;
            } else if (tipo === 'aventura') {
                formHTML += `
                    <div class="campo-form"><label>Lugar a visitar</label><input type="text" id="input-aventura-lugar" placeholder="Ej. Cristo Redentor" value="${itemExistente?.lugar || ''}"></div>
                    <div class="campo-form"><label>Miniatura (URL)</label><input type="url" id="input-aventura-miniatura" placeholder="Ej. https://.../cristo-redentor.jpg" value="${itemExistente?.miniatura || ''}"></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Precio ($)</label><input type="number" id="input-aventura-costo" placeholder="0" value="${itemExistente?.costo || ''}"></div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada</label><input type="time" id="input-aventura-llegada" value="${itemExistente?.llegada || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida</label><input type="time" id="input-aventura-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                `;
            } else if (tipo === 'restaurante') {
                formHTML += `
                    <div class="campo-form"><label>Plato o Lugar</label><input type="text" id="input-rest-plato" placeholder="Ej. Feijoada" value="${itemExistente?.plato || ''}"></div>
                    <div class="campo-form"><label>Precio estimado ($)</label><input type="number" id="input-rest-precio" placeholder="Ej. 25000" value="${itemExistente?.precio || ''}"></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada</label><input type="time" id="input-rest-llegada" value="${itemExistente?.llegada || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida</label><input type="time" id="input-rest-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                `;
            }

            formHTML += renderCampoFechaItinerario(fechaActual);
            if (esEdicion) {
                formHTML += `<button class="btn-guardar-item" onclick="actualizarItemItinerario('${idPais}', ${itemExistente.id}, '${tipo}')">Guardar cambios ✨</button></div>`;
            } else {
                formHTML += `<button class="btn-guardar-item" onclick="guardarItemItinerario('${idPais}', '${tipo}')">Añadir al Itinerario ✨</button></div>`;
            }
            contenedor.innerHTML = formHTML;

            if (tipo === 'viaje' && itemExistente?.destinoId) {
                cargarCiudadesEscalaViaje().then(() => {
                    const selectCiudad = document.getElementById('input-viaje-ciudad');
                    if (selectCiudad && itemExistente.ciudad) {
                        selectCiudad.value = itemExistente.ciudad;
                    }
                });
            }
        };

        window.guardarItemItinerario = function(idPais, tipo) {
            let nuevoItem = { tipo: tipo, id: Date.now() };
            const dataPais = destinosSonados[idPais];
            normalizarDestinosSonados();
            if (!dataPais.destinoFinal) dataPais.destinoFinal = dataPais.nombre;
            if (!dataPais.escalas) dataPais.escalas = [];
            if (!dataPais.escalasCiudades) dataPais.escalasCiudades = [];
            nuevoItem.fechaActividad = document.getElementById('input-item-fecha')?.value || '';
            const diaSeleccionado = document.getElementById('input-item-dia')?.value;
            nuevoItem.diaId = diaSeleccionado || dataPais.dias?.[0]?.id || crearDia(1, 'Llegada').id;
            if (!dataPais.dias?.length) {
                dataPais.dias = [crearDia(1, 'Llegada')];
                nuevoItem.diaId = dataPais.dias[0].id;
            }

            if (tipo === 'viaje') {
                nuevoItem.medio = document.getElementById('input-viaje-medio').value;
                const selectPaisEscala = document.getElementById('input-viaje-destino');
                const escalaId = selectPaisEscala.value;
                const escalaNombre = selectPaisEscala.options[selectPaisEscala.selectedIndex]?.text || '';
                const selectCiudadEscala = document.getElementById('input-viaje-ciudad');
                const ciudadEscala = selectCiudadEscala ? (selectCiudadEscala.value || '') : '';
                nuevoItem.destino = escalaNombre;
                nuevoItem.destinoId = escalaId;
                nuevoItem.ciudad = ciudadEscala;
                nuevoItem.horas = document.getElementById('input-viaje-horas').value || '0';
                nuevoItem.minutos = document.getElementById('input-viaje-minutos').value || '0';
                nuevoItem.costo = document.getElementById('input-viaje-costo').value || '0';
                nuevoItem.llegada = document.getElementById('input-viaje-llegada').value;
                nuevoItem.partida = document.getElementById('input-viaje-partida').value;
                const escN = escalaNombre ? escalaNombre.toUpperCase() : "";
                if (escN && escN !== dataPais.destinoFinal.toUpperCase() && !dataPais.escalas.includes(escN)) {
                    dataPais.escalas.push(escN);
                }
                if (ciudadEscala) {
                    const ciudadNormalizada = ciudadEscala.toUpperCase();
                    if (!dataPais.escalasCiudades.includes(ciudadNormalizada)) dataPais.escalasCiudades.push(ciudadNormalizada);
                }
            } else if (tipo === 'hospedaje') {
                nuevoItem.hotel = document.getElementById('input-hospedaje-nombre').value || 'Alojamiento';
                nuevoItem.noches = document.getElementById('input-hospedaje-noches').value || '1';
                nuevoItem.costo = document.getElementById('input-hospedaje-costo').value || '0';
                nuevoItem.llegada = document.getElementById('input-hospedaje-llegada').value;
                nuevoItem.partida = document.getElementById('input-hospedaje-partida').value;
                const fechaCheckoutIngresada = document.getElementById('input-hospedaje-checkout')?.value || '';
                nuevoItem.fechaCheckout = obtenerFechaCheckoutHospedaje({ ...nuevoItem, fechaCheckout: fechaCheckoutIngresada }, nuevoItem.fechaActividad);
            } else if (tipo === 'aventura') {
                nuevoItem.lugar = document.getElementById('input-aventura-lugar').value || 'Aventura';
                nuevoItem.miniatura = document.getElementById('input-aventura-miniatura').value.trim();
                nuevoItem.costo = document.getElementById('input-aventura-costo').value || '0';
                nuevoItem.llegada = document.getElementById('input-aventura-llegada').value;
                nuevoItem.partida = document.getElementById('input-aventura-partida').value;
            } else if (tipo === 'restaurante') {
                nuevoItem.plato = document.getElementById('input-rest-plato').value || 'Restaurante';
                nuevoItem.precio = document.getElementById('input-rest-precio').value || '0';
                nuevoItem.llegada = document.getElementById('input-rest-llegada').value;
                nuevoItem.partida = document.getElementById('input-rest-partida').value;
            }

            destinosSonados[idPais].itinerario.push(nuevoItem);
            derivarDiasDesdeFechasItinerario(destinosSonados[idPais]);
            document.getElementById('contenedor-formularios').innerHTML = '';
            document.querySelectorAll('.btn-tipo-item').forEach(b => b.classList.remove('seleccionado'));
            estadoVistaSonados = { modo: 'detalle', idPais };
            sincronizacionLocalEnCurso = true;
            dibujarItinerario(idPais);
        };

        window.eliminarItemItinerario = function(idPais, idItem) {
            destinosSonados[idPais].itinerario = destinosSonados[idPais].itinerario.filter(i => i.id !== idItem);
            derivarDiasDesdeFechasItinerario(destinosSonados[idPais]);
            dibujarItinerario(idPais);
        }

        window.editarItemItinerario = function(idPais, idItem) {
            const destino = destinosSonados[idPais];
            if (!destino || !Array.isArray(destino.itinerario)) return;
            const item = destino.itinerario.find(i => i.id === idItem);
            if (!item) return;
            mostrarFormularioItinerario(item.tipo, null, { item });
        };

        window.actualizarItemItinerario = function(idPais, idItem, tipo) {
            const destino = destinosSonados[idPais];
            if (!destino || !Array.isArray(destino.itinerario)) return;
            const idx = destino.itinerario.findIndex(i => i.id === idItem);
            if (idx === -1) return;

            const itemActualizado = { ...destino.itinerario[idx], tipo };
            itemActualizado.fechaActividad = document.getElementById('input-item-fecha')?.value || '';

            if (tipo === 'viaje') {
                const selectPaisEscala = document.getElementById('input-viaje-destino');
                const escalaId = selectPaisEscala.value;
                const escalaNombre = selectPaisEscala.options[selectPaisEscala.selectedIndex]?.text || '';
                const selectCiudadEscala = document.getElementById('input-viaje-ciudad');
                const ciudadEscala = selectCiudadEscala ? (selectCiudadEscala.value || '') : '';
                itemActualizado.medio = document.getElementById('input-viaje-medio').value;
                itemActualizado.destino = escalaNombre;
                itemActualizado.destinoId = escalaId;
                itemActualizado.ciudad = ciudadEscala;
                itemActualizado.horas = document.getElementById('input-viaje-horas').value || '0';
                itemActualizado.minutos = document.getElementById('input-viaje-minutos').value || '0';
                itemActualizado.costo = document.getElementById('input-viaje-costo').value || '0';
                itemActualizado.llegada = document.getElementById('input-viaje-llegada').value;
                itemActualizado.partida = document.getElementById('input-viaje-partida').value;
            } else if (tipo === 'hospedaje') {
                itemActualizado.hotel = document.getElementById('input-hospedaje-nombre').value || 'Alojamiento';
                itemActualizado.noches = document.getElementById('input-hospedaje-noches').value || '1';
                itemActualizado.costo = document.getElementById('input-hospedaje-costo').value || '0';
                itemActualizado.llegada = document.getElementById('input-hospedaje-llegada').value;
                itemActualizado.partida = document.getElementById('input-hospedaje-partida').value;
                const fechaCheckoutIngresada = document.getElementById('input-hospedaje-checkout')?.value || '';
                itemActualizado.fechaCheckout = obtenerFechaCheckoutHospedaje({ ...itemActualizado, fechaCheckout: fechaCheckoutIngresada }, itemActualizado.fechaActividad);
            } else if (tipo === 'aventura') {
                itemActualizado.lugar = document.getElementById('input-aventura-lugar').value || 'Aventura';
                itemActualizado.miniatura = document.getElementById('input-aventura-miniatura').value.trim();
                itemActualizado.costo = document.getElementById('input-aventura-costo').value || '0';
                itemActualizado.llegada = document.getElementById('input-aventura-llegada').value;
                itemActualizado.partida = document.getElementById('input-aventura-partida').value;
            } else if (tipo === 'restaurante') {
                itemActualizado.plato = document.getElementById('input-rest-plato').value || 'Restaurante';
                itemActualizado.precio = document.getElementById('input-rest-precio').value || '0';
                itemActualizado.llegada = document.getElementById('input-rest-llegada').value;
                itemActualizado.partida = document.getElementById('input-rest-partida').value;
            }

            destino.itinerario[idx] = itemActualizado;
            derivarDiasDesdeFechasItinerario(destino);
            document.getElementById('contenedor-formularios').innerHTML = '';
            document.querySelectorAll('.btn-tipo-item').forEach(b => b.classList.remove('seleccionado'));
            dibujarItinerario(idPais);
        };

        window.moverItemItinerario = function(idPais, idItem, direccion) {
            const destino = destinosSonados[idPais];
            if (!destino || !Array.isArray(destino.itinerario)) return;

            const indiceActual = destino.itinerario.findIndex(item => item.id === idItem);
            if (indiceActual === -1) return;

            const desplazamiento = direccion === 'arriba' ? -1 : 1;
            const nuevoIndice = indiceActual + desplazamiento;
            if (nuevoIndice < 0 || nuevoIndice >= destino.itinerario.length) return;

            [destino.itinerario[indiceActual], destino.itinerario[nuevoIndice]] = [destino.itinerario[nuevoIndice], destino.itinerario[indiceActual]];

            sincronizacionLocalEnCurso = true;

            const modoActivo = estadoVistaItinerario?.modo === 'calendario' ? 'calendario' : 'lista';
            dibujarItinerario(idPais);
            cambiarModoItinerario(modoActivo);
        };

        window.dibujarItinerario = function(idPais) {
            const destino = destinosSonados[idPais];
            if (!destino) return;

            const timeline = document.getElementById(`linea-tiempo-${idPais}`);
            const calendario = document.getElementById(`calendario-itinerario-${idPais}`);
            if (!timeline || !calendario) return;

            const items = Array.isArray(destino.itinerario) ? destino.itinerario : [];
            timeline.innerHTML = '';
            calendario.innerHTML = '';
            if (items.length === 0) {
                timeline.innerHTML = `<p style="color:#90A4AE; padding-left: 20px;">Itinerario vacío.</p>`;
                calendario.innerHTML = `<p style="color:#90A4AE; margin:0;">Itinerario vacío.</p>`;
                return;
            }

            const dibujarBotonesOrden = (item, deshabilitarSubir, deshabilitarBajar) => `
                <button class="btn-editar-item" onclick="moverItemItinerario('${idPais}', ${item.id}, 'arriba')" ${deshabilitarSubir ? 'disabled' : ''} title="Subir">
                    <i data-lucide="arrow-up"></i>
                </button>
                <button class="btn-editar-item" onclick="moverItemItinerario('${idPais}', ${item.id}, 'abajo')" ${deshabilitarBajar ? 'disabled' : ''} title="Bajar">
                    <i data-lucide="arrow-down"></i>
                </button>
            `;

            items.forEach((item, index) => {
                let icono = 'circle'; let titulo = ''; let detalles = '';
                const etiquetaDia = obtenerEtiquetaDia(destino, item);
                const horario = formatearRangoTemporalItem(destino, item);
                if (item.tipo === 'viaje') { icono = 'bus'; titulo = `Viaje en ${item.medio}`; detalles = `${etiquetaDia}<br>Escala: ${item.destino}${item.ciudad ? `, ${item.ciudad}` : ''}<br>Horario: ${horario}<br>Costo: $${item.costo}`; }
                else if (item.tipo === 'hospedaje') { icono = 'hotel'; titulo = item.hotel; detalles = `${etiquetaDia}<br>${item.noches} noches - Total: $${item.costo}<br>Horario: ${horario}`; }
                else if (item.tipo === 'aventura') { icono = 'mountain'; titulo = item.lugar; detalles = `${etiquetaDia} ($${item.costo})<br>Horario: ${horario}`; }
                else if (item.tipo === 'restaurante') { icono = 'utensils'; titulo = item.plato; detalles = `${etiquetaDia}<br>Gasto: $${item.precio}<br>Horario: ${horario}`; }
                const miniaturaAventura = item.tipo === 'aventura' && item.miniatura
                    ? `<img src="${item.miniatura}" alt="Miniatura de ${item.lugar || 'aventura'}" class="miniatura-aventura">`
                    : '';
                const deshabilitarSubir = index === 0;
                const deshabilitarBajar = index === (items.length - 1);
                timeline.innerHTML += `
                    <div class="item-timeline ${item.tipo}" data-itinerario-item-id="${item.id}"><div class="punto-timeline"></div>
                        <div class="item-header"><h4 class="item-titulo"><i data-lucide="${icono}"></i> ${titulo}</h4>
                        <div class="item-header-actions">${miniaturaAventura}${dibujarBotonesOrden(item, deshabilitarSubir, deshabilitarBajar)}<button class="btn-editar-item" onclick="editarItemItinerario('${idPais}', ${item.id})"><i data-lucide="pencil"></i></button><button class="btn-eliminar-item" onclick="eliminarItemItinerario('${idPais}', ${item.id})"><i data-lucide="trash-2"></i></button></div></div>
                        <div class="item-detalles">${detalles}</div>
                    </div>`;
            });

            const agrupadosPorDia = items.reduce((acumulado, item, index) => {
                const dia = obtenerDiaDeItem(destino, item);
                const claveDia = dia?.id || 'sin-dia';
                if (!acumulado[claveDia]) {
                    const diaNormalizado = normalizarDiaItinerario(dia ? `Día ${dia.numero}` : '');
                    const fechaDia = formatearFechaCortaItinerario(dia?.fecha);
                    acumulado[claveDia] = {
                        etiqueta: dia ? `DÍA ${dia.numero}${fechaDia ? ` (${fechaDia})` : ''}: ${dia.nombre}` : diaNormalizado.etiqueta,
                        orden: dia?.numero || diaNormalizado.orden,
                        lista: []
                    };
                }
                acumulado[claveDia].lista.push({ item, index });
                return acumulado;
            }, {});

            calendario.innerHTML = Object.values(agrupadosPorDia)
                .sort((a, b) => a.orden - b.orden || a.etiqueta.localeCompare(b.etiqueta))
                .map(({ etiqueta, lista }) => `
                <div class="cal-dia">
                    <h4 style="margin:0 0 8px; color:#D81B60;">${etiqueta}</h4>
                    ${lista.map(({ item, index }) => {
                        const deshabilitarSubir = index === 0;
                        const deshabilitarBajar = index === (items.length - 1);
                        return `
                            <div class="item-timeline ${item.tipo}" style="margin:8px 0;" data-itinerario-item-id="${item.id}">
                                <div class="item-header">
                                    <h4 class="item-titulo"><i data-lucide="${item.tipo === 'viaje' ? 'bus' : item.tipo === 'hospedaje' ? 'hotel' : item.tipo === 'aventura' ? 'mountain' : 'utensils'}"></i> ${item.lugar || item.hotel || item.plato || `Viaje en ${item.medio}`}</h4>
                                    <div class="item-header-actions">
                                        ${dibujarBotonesOrden(item, deshabilitarSubir, deshabilitarBajar)}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `).join('');
            lucide.createIcons();
            vincularMenuContextualItinerario(idPais, timeline);
            vincularMenuContextualItinerario(idPais, calendario);
            if (estadoVistaItinerario?.modo === 'calendario') {
                renderizarCalendarioItinerario(idPais);
            }
        };

        window.guardarPortadaItinerario = function(idPais) {
            const input = document.getElementById('input-portada-itinerario');
            if (!input || !destinosSonados[idPais]) return;
            destinosSonados[idPais].portadaUrl = input.value.trim();
            estadoEdicionPortadaItinerario[idPais] = false;
            abrirPlanificador(idPais);
        };

        window.activarEdicionPortadaItinerario = function(idPais) {
            estadoEdicionPortadaItinerario[idPais] = true;
            abrirPlanificador(idPais);
        };
        document.addEventListener("DOMContentLoaded", iniciarSincronizacionFirebase);
    
