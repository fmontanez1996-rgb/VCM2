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
        let hayCambiosPendientesDeSincronizar = false;
        let intervaloAutosave = null;
        let rutaEstadoFirebase = null;
        let estadoEdicionPortadaItinerario = {};
        let bibliotecaRevivir = [];
        let indiceMediaRevivirActual = -1;
        let playersMusica = {};
        window.playersMusica = playersMusica;
        let youtubeApiPromise = null;
        let youtubeApiReadyResolver = null;
        let controladorCargaVistaDrive = null;
        const LIMITE_ESTADO_FIREBASE_BYTES = 8 * 1024 * 1024;
        const LIMITE_IMAGEN_FIREBASE_BYTES = 350 * 1024;
        const CONFIG_VISTA_DRIVE = Object.freeze({
            permitirAbrirEnPestana: true,
            apiFolderImagesEndpoint: typeof window !== 'undefined' && window.__DRIVE_FOLDER_IMAGES_API__
                ? String(window.__DRIVE_FOLDER_IMAGES_API__).trim()
                : '/api/drive-folder-images'
        });

        const RUTA_ESTADO_COMPARTIDO = "nuestraHistoria/estadoCompartido";

        function cargarYoutubeIframeApiUnaVez() {
            if (window.YT && typeof window.YT.Player === 'function') {
                return Promise.resolve(window.YT);
            }
            if (youtubeApiPromise) return youtubeApiPromise;

            youtubeApiPromise = new Promise((resolve) => {
                youtubeApiReadyResolver = resolve;
            });

            const scriptExistente = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
            if (!scriptExistente) {
                const tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                document.head.appendChild(tag);
            }

            return youtubeApiPromise;
        }

        window.onYouTubeIframeAPIReady = function() {
            if (typeof youtubeApiReadyResolver === 'function') {
                youtubeApiReadyResolver(window.YT);
                youtubeApiReadyResolver = null;
            }
        };

        function obtenerIdPlayerMusica(idPais, idProvincia = null) {
            return idProvincia ? `player-musica-${idPais}-${idProvincia}` : `player-musica-${idPais}`;
        }

        function limpiarPlayersMusica() {
            Object.keys(playersMusica).forEach((idPlayer) => {
                const player = playersMusica[idPlayer];
                if (player && typeof player.destroy === 'function') {
                    player.destroy();
                }
                delete playersMusica[idPlayer];
            });
        }

        function actualizarEstadoBotonesMusica(idPlayer, estado) {
            const btnPlay = document.getElementById(`btn-play-${idPlayer}`);
            const btnPause = document.getElementById(`btn-pause-${idPlayer}`);
            if (!btnPlay || !btnPause) return;

            if (estado === window.YT?.PlayerState?.PLAYING) {
                btnPlay.classList.add('activo');
                btnPause.classList.remove('activo');
            } else if (estado === window.YT?.PlayerState?.PAUSED) {
                btnPause.classList.add('activo');
                btnPlay.classList.remove('activo');
            } else {
                btnPlay.classList.remove('activo');
                btnPause.classList.remove('activo');
            }
        }

        function inicializarPlayerMusica(idPlayer, videoIdMusica) {
            if (!videoIdMusica) return;

            cargarYoutubeIframeApiUnaVez().then(() => {
                if (!document.getElementById(idPlayer)) return;
                if (playersMusica[idPlayer] && typeof playersMusica[idPlayer].destroy === 'function') {
                    playersMusica[idPlayer].destroy();
                }

                playersMusica[idPlayer] = new window.YT.Player(idPlayer, {
                    playerVars: {
                        origin: window.location.origin
                    },
                    events: {
                        onReady: () => actualizarEstadoBotonesMusica(idPlayer, null),
                        onStateChange: (event) => actualizarEstadoBotonesMusica(idPlayer, event.data)
                    }
                });
            });
        }

        window.playMusica = function(idPlayer) {
            const player = playersMusica[idPlayer];
            if (player && typeof player.playVideo === 'function') player.playVideo();
        };

        window.pauseMusica = function(idPlayer) {
            const player = playersMusica[idPlayer];
            if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
        };

        window.reiniciarMusica = function(idPlayer) {
            const player = playersMusica[idPlayer];
            if (!player) return;
            if (typeof player.seekTo === 'function') player.seekTo(0, true);
            if (typeof player.playVideo === 'function') player.playVideo();
        };

        function obtenerRutaEstadoFirebase(uid = "") {
            return RUTA_ESTADO_COMPARTIDO;
        }
        const ESTADOS_PROVINCIAS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
        function obtenerEstadoActual() {
            normalizarColeccionMemorias();
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

        function resolverUrlDriveAlbum(album = {}) {
            if (!album || typeof album !== "object") return "";

            const portada = typeof album.portada === "string" ? album.portada.trim() : "";
            const candidatos = [
                album.driveUrl,
                album.url,
                album.link,
                album.enlace,
                album.carpetaUrl,
                album.carpeta
            ]
                .map((valor) => typeof valor === "string" ? valor.trim() : "")
                .filter(Boolean);

            if (!candidatos.length) return "";

            const esDrive = (valor) => valor.includes("drive.google.com");

            const urlDriveDistintaPortada = candidatos.find((valor) => esDrive(valor) && (!portada || valor !== portada));
            if (urlDriveDistintaPortada) return urlDriveDistintaPortada;

            const urlDrive = candidatos.find(esDrive);
            if (urlDrive) return urlDrive;

            return candidatos.find((valor) => !portada || valor !== portada) || candidatos[0];
        }

        function extraerIdDriveDesdeUrl(url = "") {
            const valor = String(url || "").trim();
            if (!valor) return null;

            const patrones = [
                /\/folders\/([a-zA-Z0-9_-]+)/i,
                /[?&]id=([a-zA-Z0-9_-]+)/i,
                /\/file\/d\/([a-zA-Z0-9_-]+)/i,
                /\/document\/d\/([a-zA-Z0-9_-]+)/i,
                /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i,
                /\/presentation\/d\/([a-zA-Z0-9_-]+)/i
            ];

            for (const patron of patrones) {
                const match = valor.match(patron);
                if (match?.[1]) return match[1];
            }
            return null;
        }

        function construirUrlDriveEmbebida(urlDrive = "") {
            const url = String(urlDrive || "").trim();
            if (!url || !url.includes("drive.google.com")) return "";

            const idDrive = extraerIdDriveDesdeUrl(url);
            if (!idDrive) return "";

            const esCarpeta = /\/folders\//i.test(url) || /embeddedfolderview/i.test(url);
            if (esCarpeta) {
                return `https://drive.google.com/embeddedfolderview?id=${idDrive}#grid`;
            }
            return `https://drive.google.com/file/d/${idDrive}/preview`;
        }

        function normalizarMemoriasDestino(destino) {
            if (!destino || typeof destino !== "object") return { albumes: [], historias: [] };

            const albumesActuales = Array.isArray(destino.albumes) ? destino.albumes : [];
            const historiasActuales = Array.isArray(destino.historias) ? destino.historias : [];
            const drivesLegacy = Array.isArray(destino.drives) ? destino.drives : [];
            const notasLegacy = Array.isArray(destino.notas) ? destino.notas : [];

            const albumes = [...albumesActuales, ...drivesLegacy].filter((item) => item && typeof item === "object");
            const historias = [...historiasActuales, ...notasLegacy].filter((item) => item && typeof item === "object");

            destino.albumes = albumes;
            destino.historias = historias;
            delete destino.drives;
            delete destino.notas;
            return destino;
        }

        function normalizarColeccionMemorias() {
            Object.values(paisesVisitados || {}).forEach((destinoPais) => normalizarMemoriasDestino(destinoPais));
            Object.values(provinciasVisitadas || {}).forEach((provinciasPais) => {
                if (!provinciasPais || typeof provinciasPais !== "object") return;
                Object.values(provinciasPais).forEach((destinoProvincia) => normalizarMemoriasDestino(destinoProvincia));
            });
        }


        function posicionarMenuContextual(menu, x, y, contenedorMapa) {
            const menuWidth = menu.node().offsetWidth;
            const menuHeight = menu.node().offsetHeight;
            const mapWidth = contenedorMapa.offsetWidth;
            const mapHeight = contenedorMapa.offsetHeight;

            let finalX = x + 15;
            let finalY = y + 15;

            if (finalX + menuWidth > mapWidth) finalX = x - menuWidth - 15;
            if (finalY + menuHeight > mapHeight) finalY = y - menuHeight - 15;

            if (finalX < 80) finalX = 80;
            if (finalY < 10) finalY = 10;

            menu.style("left", finalX + "px").style("top", finalY + "px");
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

        function normalizarPortadaUrl(valor = "") {
            const url = String(valor || "").trim();
            if (!url) return "";
            if (!/^https?:\/\//i.test(url)) return "";
            return url;
        }

        function obtenerPortadaPais(idPais = "") {
            const portadaPais = paisesVisitados?.[idPais]?.portadaUrl;
            return normalizarPortadaUrl(portadaPais);
        }

        function obtenerPortadaCiudad(idPais = "", idProvincia = "") {
            const portadaCiudad = provinciasVisitadas?.[idPais]?.[idProvincia]?.portadaUrl;
            return normalizarPortadaUrl(portadaCiudad) || obtenerPortadaPais(idPais);
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

        function estimarBytesDataUrl(dataUrl = "") {
            if (typeof dataUrl !== "string") return 0;
            const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
            return Math.ceil((base64.length * 3) / 4);
        }

        function estimarBytesEstado(estado) {
            try {
                return new TextEncoder().encode(JSON.stringify(estado)).length;
            } catch (error) {
                return Number.POSITIVE_INFINITY;
            }
        }

        function aplicarEstadoRemoto(estado) {
            paisesVisitados = estado?.paisesVisitados || {};
            provinciasVisitadas = estado?.provinciasVisitadas || {};
            destinosSonados = estado?.destinosSonados || {};
            normalizarColeccionMemorias();
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
                const fechaActividad = item?.tipo === 'hospedaje'
                    ? obtenerFechaLlegadaHospedaje(item)
                    : String(item?.fechaActividad || '').trim();
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
                const fecha = item?.tipo === 'hospedaje'
                    ? obtenerFechaLlegadaHospedaje(item)
                    : String(item.fechaActividad || '').trim();
                if (esFechaActividadValida(fecha) && diaPorFecha.has(fecha)) {
                    if (item?.tipo === 'hospedaje') item.fechaActividad = fecha;
                    item.diaId = diaPorFecha.get(fecha).id;
                } else {
                    if (item?.tipo === 'hospedaje') {
                        item.fechaLlegada = '';
                    }
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

        function formatearMonedaItinerario(valor) {
            const numero = Number(valor);
            if (Number.isNaN(numero)) return '$0';
            return `$${numero.toLocaleString('es-AR')}`;
        }

        function obtenerLineaDiaItem(destino, item) {
            const etiquetaDia = obtenerEtiquetaDia(destino, item);
            return etiquetaDia.replace(/^DÍA/i, 'Día');
        }

        function obtenerDestinoViajeFormateado(item = {}) {
            const ciudad = typeof item?.ciudad === 'string' ? item.ciudad.trim() : '';
            const pais = typeof item?.destino === 'string' ? item.destino.trim() : '';
            if (ciudad && pais) return `${ciudad}, ${pais}`;
            if (ciudad) return `${ciudad}, País por definir`;
            if (pais) return `Ciudad por definir, ${pais}`;
            return 'Destino por definir';
        }

        function obtenerOrigenViajePorDefecto(destino, indiceActual = -1) {
            if (!destino || !Array.isArray(destino.itinerario)) return 'Mendoza, Argentina';
            for (let i = indiceActual - 1; i >= 0; i--) {
                const previo = destino.itinerario[i];
                if (!previo || previo.tipo !== 'viaje') continue;
                return obtenerDestinoViajeFormateado(previo);
            }
            return 'Mendoza, Argentina';
        }

        function obtenerHorasViaje(item = {}) {
            const horaSalida = normalizarHoraItinerario(item.partida);
            const horaLlegada = normalizarHoraItinerario(item.llegada);
            return {
                horaSalida: horaSalida || horaLlegada || 'Sin horario',
                horaLlegada: horaLlegada || horaSalida || 'Sin horario'
            };
        }

        function obtenerResumenTarjetaItinerario(destino, item = {}) {
            const dia = obtenerDiaDeItem(destino, item);
            const numeroDia = dia?.numero || 1;
            const diaLinea = obtenerLineaDiaItem(destino, item);
            const fechaInicioISO = obtenerFechaBaseItem(destino, item);
            const fechaInicio = formatearFechaCortaItinerario(fechaInicioISO);
            const { fechaFin, horaFin } = obtenerRangoTemporalItem(destino, item);
            const fechaFinTexto = formatearFechaCortaItinerario(fechaFin);
            const horaInicio = normalizarHoraItinerario(item.llegada) || 'Sin horario';
            const horaSalida = normalizarHoraItinerario(item.partida) || horaFin || 'Sin horario';
            const costoBase = formatearMonedaItinerario(item.costo ?? item.precio ?? 0);
            const numeroDiaFechaFin = (Array.isArray(destino?.dias) && esFechaActividadValida(fechaFin))
                ? (destino.dias.find((diaActual) => diaActual?.fecha === fechaFin)?.numero || numeroDia)
                : numeroDia;
            const { horaSalida: horaSalidaViaje, horaLlegada: horaLlegadaViaje } = obtenerHorasViaje(item);

            if (item._esSalidaViajeVirtual) {
                const indiceItem = Array.isArray(destino?.itinerario) ? destino.itinerario.findIndex((actual) => actual?.id === item?.id) : -1;
                const origen = item.origen || obtenerOrigenViajePorDefecto(destino, indiceItem);
                return [
                    `Origen: ${origen}`,
                    `Salida: ${fechaInicio || 'Sin fecha'} - ${horaSalidaViaje}`
                ];
            }

            if (item._esLlegadaViajeVirtual) {
                return [
                    `Destino: ${obtenerDestinoViajeFormateado(item)}`,
                    `Llegada: ${fechaFinTexto || fechaInicio || 'Sin fecha'} - ${horaLlegadaViaje}`
                ];
            }

            if (item._esCheckinHospedajeVirtual) {
                const noches = Number(item.noches) || 1;
                return [
                    `${fechaInicio || 'Sin fecha'}-${fechaFinTexto || fechaInicio || 'Sin fecha'}`,
                    `(${noches} ${noches === 1 ? 'Noche' : 'Noches'})`,
                    `Chek-in: ${horaSalida}`
                ];
            }

            if (item._esCheckoutVirtual) {
                const noches = Number(item.noches) || 1;
                return [
                    `${fechaInicio || 'Sin fecha'}-${fechaFinTexto || fechaInicio || 'Sin fecha'}`,
                    `(${noches} ${noches === 1 ? 'Noche' : 'Noches'})`,
                    `Check-out: ${horaInicio}`
                ];
            }

            if (item.tipo === 'viaje') {
                const indiceItem = Array.isArray(destino?.itinerario) ? destino.itinerario.findIndex((actual) => actual?.id === item?.id) : -1;
                const origen = item.origen || obtenerOrigenViajePorDefecto(destino, indiceItem);
                const destinoViaje = obtenerDestinoViajeFormateado(item);
                return [
                    `Origen: ${origen}`,
                    `Destino: ${destinoViaje}`,
                    `Salida: ${fechaInicio || 'Sin fecha'}, ${horaSalidaViaje} (día ${numeroDia})`,
                    `Llegada: ${fechaFinTexto || fechaInicio || 'Sin fecha'}, ${horaLlegadaViaje} (día ${numeroDiaFechaFin})`,
                    `Precio por persona ${costoBase}`
                ];
            }

            if (item.tipo === 'aventura') {
                const fechaAventura = fechaInicio || fechaFinTexto || 'Sin fecha';
                const horaLlegada = normalizarHoraItinerario(item.llegada) || 'Sin horario';
                const horaPartida = normalizarHoraItinerario(item.partida) || horaFin || 'Sin horario';
                return [
                    `DÍA ${numeroDia}`,
                    `${fechaAventura} ${horaLlegada} - ${horaPartida}`,
                    `Precio por persona: ${costoBase}`
                ];
            }

            if (item.tipo === 'hospedaje') {
                const noches = Number(item.noches) || 1;
                const precioPorNocheCalculado = Number(item.precioPorNoche || 0) > 0
                    ? Number(item.precioPorNoche || 0)
                    : (noches > 0 ? Number(item.costo || 0) / noches : item.costo || 0);
                const precioPorNoche = formatearMonedaItinerario(precioPorNocheCalculado);
                return [
                    `Cantidad de Noches: ${noches}`,
                    `Fecha de Llegada: ${fechaInicio || 'Sin fecha'} (día ${numeroDia})`,
                    `Check in: ${horaInicio}`,
                    `Fecha de salida: ${fechaFinTexto || fechaInicio || 'Sin fecha'} (día ${numeroDiaFechaFin})`,
                    `Check out: ${horaSalida}`,
                    `Precio por noche ${precioPorNoche}`,
                    `Total ${costoBase}`
                ];
            }

            const platoRestaurante = String(item.plato || 'No especificada').trim();
            const platoFormateado = platoRestaurante.toLowerCase() === 'hamburguesas'
                ? 'HAMBURGUESAS'
                : platoRestaurante;
            return [
                `Día: ${numeroDia}`,
                `Horario de llegada: ${horaInicio}`,
                `Horario de Salida: ${horaSalida}`,
                `Comida: ${platoFormateado}`,
                `Precio por persona: ${formatearMonedaItinerario(item.costo ?? item.precio ?? 0)}`
            ];
        }
        function guardarEstadoEnFirebase(forzar = false) {
            if (!firebaseDb || !rutaEstadoFirebase) return Promise.resolve(false);
            if (!estadoInicialSincronizado) {
                hayCambiosPendientesDeSincronizar = true;
                return Promise.resolve(false);
            }

            normalizarColeccionMemorias();
            const estado = obtenerEstadoActual();
            const bytesEstado = estimarBytesEstado(estado);
            if (bytesEstado > LIMITE_ESTADO_FIREBASE_BYTES) {
                console.error(`Estado demasiado grande para Firebase (${bytesEstado} bytes). Reduce imágenes o historias.`);
                return Promise.resolve(false);
            }
            const huellaActual = calcularHuellaEstado(estado);
            if (!forzar && huellaActual === ultimaHuellaSincronizada) return Promise.resolve(true);
            sincronizacionLocalEnCurso = true;
            hayCambiosPendientesDeSincronizar = false;

            return firebaseDb.ref(rutaEstadoFirebase).set(estado)
                .then(() => {
                    ultimaHuellaSincronizada = huellaActual;
                    return true;
                })
                .catch((error) => {
                    console.error("No se pudo guardar en Firebase:", error);
                    hayCambiosPendientesDeSincronizar = true;
                    return false;
                });
        }

        function registrarCambioLocal(forzarGuardado = false) {
            sincronizacionLocalEnCurso = true;
            hayCambiosPendientesDeSincronizar = true;
            if (forzarGuardado) {
                guardarEstadoEnFirebase(true);
            }
        }

        function marcarEstadoInicialSincronizado() {
            estadoInicialSincronizado = true;
            if (hayCambiosPendientesDeSincronizar) {
                guardarEstadoEnFirebase(true);
            }
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
                            if (sincronizacionLocalEnCurso) {
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
                            marcarEstadoInicialSincronizado();
                            guardarEstadoEnFirebase(true);
                        }

                        marcarEstadoInicialSincronizado();
                    }, (error) => {
                        console.error("Error al leer estado desde Firebase:", error);
                        marcarEstadoInicialSincronizado();
                        cargarMapa();
                    });

                    if (!intervaloAutosave) {
                        intervaloAutosave = setInterval(() => guardarEstadoEnFirebase(), 1200);
                        window.addEventListener("beforeunload", () => guardarEstadoEnFirebase(true));
                    }
                });
            } catch (error) {
                console.error("No se pudo inicializar Firebase:", error);
                marcarEstadoInicialSincronizado();
                cargarMapa();
            }
        }

        function sincronizarEstadoConRutaPublica() {
            if (!firebaseDb) {
                marcarEstadoInicialSincronizado();
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
                    if (sincronizacionLocalEnCurso) {
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
                marcarEstadoInicialSincronizado();
            }, (error) => {
                console.error("Error al leer estado público desde Firebase:", error);
                marcarEstadoInicialSincronizado();
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
            if (targetId === 'vista-revivir') renderizarPantallaRevivir();
            if (targetId !== 'vista-revivir') detenerReproductorRevivir();
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
                        posicionarMenuContextual(menu, x, y, document.getElementById("world-map"));

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
                            .classed("menu-visible", true);
                        posicionarMenuContextual(menu, x, y, container.node());

                        d3.select("#opc-prov-visitado").on("click", function() {
                            if (!provinciasVisitadas[idPais]) provinciasVisitadas[idPais] = {};
                            const selectorPath = `#${CSS.escape(idPathProvincia)}`;
                            const pathElem = d3.select(selectorPath);

                            if (!provinciasVisitadas[idPais][idProvincia]) {
                                provinciasVisitadas[idPais][idProvincia] = { nombre: nombreProvincia, portadaUrl: "" };
                                pathElem.classed('visitada', true).style("fill", "#FF6B9D");

                                if (!paisesVisitados[idPais]) {
                                    paisesVisitados[idPais] = { nombre: nombrePais, albumes: [], historias: [], musica: null, portadaUrl: "" };
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
                <div id="encabezado-sonados" class="encabezado-seccion encabezado-sonados-metal" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 class="titulo-sonados-metal"><i data-lucide="heart"></i> Proximos Destinos</h2>
                    <button id="btn-nueva-aventura-sonados" class="btn-nueva-aventura" onclick="mostrarSelectorNuevoDestino()" style="border: none; padding: 10px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="plus-circle"></i> Nueva Aventura
                    </button>
                </div>
                <div id="selector-nuevo-destino" class="selector-nuevo-destino">
                    <h3 class="titulo-selector-destino">¿A dónde quieres ir?</h3>
                    <select id="select-pais-nuevo" class="select-aventura-metal" onchange="cargarCiudadesAventura()">
                    <option value="" disabled selected>Elige un país...</option>
                </select>

                <select id="select-ciudad-aventura" class="select-aventura-metal">
                    <option value="" disabled selected>Elige una ciudad...</option>
                </select>
                    <div class="acciones-selector-aventura">
                        <button onclick="confirmarNuevoDestino()" class="btn-aventura-metal btn-aventura-crear">Crear Aventura</button>
                        <button onclick="ocultarSelectorNuevoDestino()" class="btn-aventura-metal btn-aventura-cancelar">Cancelar</button>
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
                listaHTML.className = 'lista-paises lista-sonados';
                idsPaises.forEach(id => {
                    const pais = destinosSonados[id];
                    const totalEscalas = contarEscalasDestino(pais);
                    const nombrePrincipal = obtenerNombreCabeceraDestino(pais);
                    const escalasResumen = obtenerResumenEscalas(pais);
                    const portadaLista = pais.portadaUrl || 'https://via.placeholder.com/240x150?text=Sin+Portada';
                    listaHTML.innerHTML += `
                        <div class="tarjeta-pais tarjeta-sonado">
                            <img class="miniatura-portada-lista imagen-sonado" src="${portadaLista}" alt="Imagen de ${nombrePrincipal}" onclick="abrirModalUrlsAventuras('${id}')" role="button" tabindex="0" onkeydown="manejarTeclaMiniatura(event, '${id}')">
                            <div class="info-pais info-sonado">
                                <div>
                                    <h3 class="destino-principal rojo-metal">${nombrePrincipal}</h3>
                                    ${escalasResumen ? `<div class="destino-escalas">(${escalasResumen})</div>` : ''}
                                    <span class="zonas-badge">${totalEscalas} escalas</span>
                                </div>
                            </div>
                            <div class="acciones-itinerario-card">
                                <button class="btn-accion-pais secundario" onclick="abrirPlanificador('${id}')">Ver Itinerario <i data-lucide="calendar"></i></button>
                            </div>
                        </div>`;
                });
                scrollArea.appendChild(listaHTML);
            }
            lucide.createIcons();
        }

        function contarEscalasDestino(destino) {
            if (!destino || typeof destino !== 'object') return 0;
            const escalasCiudades = Array.isArray(destino.escalasCiudades) ? destino.escalasCiudades.filter(Boolean) : [];
            const escalasPaises = Array.isArray(destino.escalas) ? destino.escalas.filter(Boolean) : [];
            if (escalasCiudades.length) return escalasCiudades.length;
            if (escalasPaises.length) return escalasPaises.length;
            return 0;
        }

        window.manejarTeclaMiniatura = function(event, idPais) {
            if (!event) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                abrirModalUrlsAventuras(idPais);
            }
        };

        window.abrirModalUrlsAventuras = function(idPais) {
            const destino = destinosSonados[idPais];
            if (!destino) return;

            cerrarModalUrlsAventuras();

            const urlsAventuras = (Array.isArray(destino.itinerario) ? destino.itinerario : [])
                .filter(item => item?.tipo === 'aventura' && typeof item?.miniatura === 'string' && item.miniatura.trim())
                .map(item => {
                    const urlMiniatura = item.miniatura.trim();
                    const urlEnlace = typeof item.url === 'string' && item.url.trim()
                        ? item.url.trim()
                        : urlMiniatura;
                    return {
                        nombre: item.lugar || 'Aventura',
                        urlMiniatura,
                        urlEnlace
                    };
                });

            const modal = document.createElement('div');
            modal.className = 'modal-url-aventuras';
            modal.id = 'modal-url-aventuras';
            modal.onclick = (e) => {
                if (e.target === modal) cerrarModalUrlsAventuras();
            };

            const tituloDestino = obtenerNombreCabeceraDestino(destino);
            const contenidoLista = urlsAventuras.length
                ? `<ul class="modal-url-aventuras-lista">
                    ${urlsAventuras.map((item, index) => `
                        <li class="modal-url-aventuras-item">
                            <img class="modal-url-aventuras-miniatura" src="${item.urlMiniatura}" alt="Imagen de ${item.nombre}" loading="lazy">
                            <div class="modal-url-aventuras-detalle">
                                <strong>${index + 1}. ${item.nombre}</strong>
                                <a href="${item.urlEnlace}" target="_blank" rel="noopener noreferrer">${item.urlEnlace}</a>
                            </div>
                        </li>
                    `).join('')}
                  </ul>`
                : `<p style="margin:0; color:#607D8B; font-weight:700;">No hay URLs cargadas para aventuras en este itinerario todavía.</p>`;

            modal.innerHTML = `
                <div class="modal-url-aventuras-contenido" role="dialog" aria-modal="true" aria-label="URLs de aventuras">
                    <div class="modal-url-aventuras-header">
                        <h3 style="margin:0; color:#D81B60;">URLs de aventuras · ${tituloDestino}</h3>
                        <button class="btn-cerrar-menu" onclick="cerrarModalUrlsAventuras()" aria-label="Cerrar listado de URLs">×</button>
                    </div>
                    ${contenidoLista}
                </div>
            `;

            document.body.appendChild(modal);
        };

        window.cerrarModalUrlsAventuras = function() {
            const modal = document.getElementById('modal-url-aventuras');
            if (modal) modal.remove();
        };

        window.renderizarPantallaRecuerdos = function() {
            estadoVistaRecuerdos = { modo: 'lista', idPais: null, idProvincia: null, submodo: 'ver', seccionNuevo: 'drive' };
            const contenedor = document.getElementById('vista-vividas');
            const idsPaises = Object.keys(paisesVisitados);

            contenedor.innerHTML = `
                <div class="encabezado-seccion encabezado-galeria-recuerdos" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <h2 class="titulo-galeria-recuerdos"><i data-lucide="camera"></i> Galería de Recuerdos</h2>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <button id="btn-nuevo-recuerdo" class="btn-nueva-aventura" onclick="mostrarSelectorNuevoRecuerdo()" style="border: none; padding: 10px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="plus-circle"></i> NUEVO RECUERDO
                        </button>
                    </div>
                </div>
                
                <div id="selector-nuevo-recuerdo" class="selector-nuevo-recuerdo">
                <select id="select-pais-recuerdo" class="select-recuerdo select-recuerdo-pais" onchange="cargarCiudadesRecuerdo()">
                    <option value="" disabled selected>Elegí un país...</option>
                </select>

                <div id="contenedor-ciudad-recuerdo" class="contenedor-ciudad-recuerdo">
                    <select id="select-ciudad-recuerdo" class="select-recuerdo">
                        <option value="" disabled selected>¿Qué ciudad, bebé?</option>
                    </select>
                </div>

                <div class="acciones-selector-recuerdo">
                    <button onclick="confirmarNuevoRecuerdo()" class="btn-recuerdo btn-recuerdo-guardar">Guardar Recuerdo</button>
                    <button onclick="ocultarSelectorNuevoRecuerdo()" class="btn-recuerdo btn-recuerdo-cancelar">Cancelar</button>
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
                    const portadaPais = obtenerPortadaPais(id);
                    const portadaHTML = portadaPais
                        ? `<img class="portada-tarjeta portada-tarjeta-pais" src="${portadaPais}" alt="Portada de ${pais.nombre}" loading="lazy">`
                        : '';
                    listaHTML.innerHTML += `
                        <div class="tarjeta-pais" data-pais-id="${id}">
                            ${portadaHTML}
                            <div class="info-pais">
                                <div><h3 class="nombre-pais-lista">${pais.nombre}</h3><span class="zonas-badge">${numMemorias} memorias</span></div>
                            </div>
                            <button class="btn-accion-pais" onclick="abrirAlbum('${id}')">Ver Galería</button>
                        </div>`;
                });
                scrollArea.appendChild(listaHTML);
                scrollArea.querySelectorAll('.tarjeta-pais[data-pais-id]').forEach((tarjeta) => {
                    tarjeta.addEventListener('contextmenu', (event) => abrirMenuContextualPortada(event, tarjeta.dataset.paisId));
                });
            }
            lucide.createIcons();
            actualizarVisibilidadEncabezadoRecuerdos(false);
        }

        function actualizarVisibilidadEncabezadoRecuerdos(ocultar) {
            const encabezado = document.querySelector('#vista-vividas .encabezado-seccion');
            if (!encabezado) return;
            encabezado.style.display = ocultar ? 'none' : 'flex';
        }

        function cerrarMenuContextualPortada() {
            const menu = document.getElementById('menu-contextual-portada');
            if (menu) menu.remove();
        }

        function abrirMenuContextualPortada(event, idPais, idProvincia = null) {
            event.preventDefault();
            event.stopPropagation();
            cerrarMenuContextualPortada();

            const menu = document.createElement('div');
            menu.id = 'menu-contextual-portada';
            menu.className = 'menu-contextual-itinerario menu-visible';
            const etiqueta = idProvincia ? 'Editar portada' : 'Agregar portada';

            menu.innerHTML = `
                <ul class="menu-itinerario-lista">
                    <li id="opc-portada-editar"><i data-lucide="image-plus"></i> ${etiqueta}</li>
                </ul>
            `;
            document.body.appendChild(menu);
            lucide.createIcons();

            const margen = 12;
            const ancho = menu.offsetWidth || 220;
            const alto = menu.offsetHeight || 84;
            const maxX = window.scrollX + window.innerWidth - ancho - margen;
            const maxY = window.scrollY + window.innerHeight - alto - margen;
            menu.style.left = `${Math.max(window.scrollX + margen, Math.min(event.pageX, maxX))}px`;
            menu.style.top = `${Math.max(window.scrollY + margen, Math.min(event.pageY, maxY))}px`;

            document.getElementById('opc-portada-editar')?.addEventListener('click', () => {
                cerrarMenuContextualPortada();
                window.editarPortadaTarjeta(idPais, idProvincia);
            });

            const manejarClick = (ev) => {
                if (!menu.contains(ev.target)) {
                    cerrarMenuContextualPortada();
                    document.removeEventListener('mousedown', manejarClick);
                    document.removeEventListener('keydown', manejarEscape);
                }
            };
            const manejarEscape = (ev) => {
                if (ev.key === 'Escape') {
                    cerrarMenuContextualPortada();
                    document.removeEventListener('mousedown', manejarClick);
                    document.removeEventListener('keydown', manejarEscape);
                }
            };
            document.addEventListener('mousedown', manejarClick);
            document.addEventListener('keydown', manejarEscape);
        }

        window.editarPortadaTarjeta = function(idPais, idProvincia = null) {
            if (idProvincia) {
                const ciudad = provinciasVisitadas?.[idPais]?.[idProvincia];
                if (!ciudad) return;
                const valorInicial = normalizarPortadaUrl(ciudad.portadaUrl) || obtenerPortadaPais(idPais) || "";
                const nuevaUrl = window.prompt(`Editar portada para ${ciudad.nombre}`, valorInicial);
                if (nuevaUrl === null) return;
                ciudad.portadaUrl = normalizarPortadaUrl(nuevaUrl);
                window.abrirAlbum(idPais);
                return;
            }

            const pais = paisesVisitados?.[idPais];
            if (!pais) return;
            const nuevaUrl = window.prompt(`Agregar portada para ${pais.nombre}`, obtenerPortadaPais(idPais));
            if (nuevaUrl === null) return;
            pais.portadaUrl = normalizarPortadaUrl(nuevaUrl);
            window.renderizarPantallaRecuerdos();
        };

        window.mostrarSelectorNuevoRecuerdo = function() {
            const selector = document.getElementById('selector-nuevo-recuerdo');
            const boton = document.getElementById('btn-nuevo-recuerdo');
            if (selector) selector.style.display = 'block';
            if (boton) boton.classList.add('activo-form');
        };

        window.ocultarSelectorNuevoRecuerdo = function() {
            const selector = document.getElementById('selector-nuevo-recuerdo');
            const boton = document.getElementById('btn-nuevo-recuerdo');
            if (selector) selector.style.display = 'none';
            if (boton) boton.classList.remove('activo-form');
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
                    paisesVisitados[idPais] = { nombre: nombrePais, albumes: [], historias: [], musica: null, portadaUrl: "" };
                }
                d3.select(`.pais[id="${idPais}"]`).classed('visitado', true);

                // 2. Guardar y pintar Ciudad
                if (!provinciasVisitadas[idPais]) provinciasVisitadas[idPais] = {};
                if (!provinciasVisitadas[idPais][idProv]) {
                    provinciasVisitadas[idPais][idProv] = { nombre: nombreProv, albumes: [], historias: [], portadaUrl: "" };
                }

                // Forzar el pintado de la ciudad (por si el mapa detallado está cargado)
                try {
                    d3.select(`#${CSS.escape(idProv)}`).classed('visitada', true);
                } catch(e) {}

                registrarCambioLocal(true);
                renderizarPantallaRecuerdos();
                window.ocultarSelectorNuevoRecuerdo();
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
            const contenedor = document.getElementById('vista-vividas');

            // Si NO hay provincia seleccionada, siempre mostramos el menú de provincias (eliminamos el acceso general)
            if (!idProvincia) {
                actualizarVisibilidadEncabezadoRecuerdos(false);
                estadoVistaRecuerdos = { modo: 'provincias', idPais, idProvincia: null, submodo: 'ver', seccionNuevo: 'drive' };
                const provs = provinciasVisitadas[idPais] || {};
                const idsProvincias = Object.keys(provs);

                contenedor.innerHTML = `
                    <div class="contenedor-scroll" id="scroll-recuerdos">
                        <div class="cabecera-detalle cabecera-destinos-pais">
                            <button class="btn-volver" onclick="renderizarPantallaRecuerdos()" title="Volver"><i data-lucide="arrow-left"></i></button>
                            <h2 class="titulo-destinos-pais"><i data-lucide="map" class="icono-mapa-destino"></i> Destinos en ${pais.nombre}</h2>
                            <button id="btn-agregar-ciudad-${idPais}" class="btn-agregar-ciudad" onclick="mostrarSelectorNuevaCiudad('${idPais}')">
                                <i data-lucide="plus-circle" style="width: 18px;"></i> Agregar ciudad
                            </button>
                        </div>

                        <div class="galeria-grid">
                        ${idsProvincias.length === 0 ? '<div style="grid-column: 1/-1; text-align: center; color: #90A4AE; padding: 30px; font-style: italic; background: white; border-radius: 12px; border: 1px dashed #CFD8DC;">Aún no has agregado ninguna ciudad a este país. Toca "Agregar ciudad" para empezar.</div>' : ''}
                        ${idsProvincias.map(pid => `
                            <div class="tarjeta-agregar tarjeta-ciudad" data-pais-id="${idPais}" data-prov-id="${pid}" onclick="window.abrirAlbumDetalle('${idPais}', '${pid}')">
                                ${obtenerPortadaCiudad(idPais, pid) ? `<img class="portada-tarjeta portada-tarjeta-ciudad" src="${obtenerPortadaCiudad(idPais, pid)}" alt="Portada de ${provs[pid].nombre}" loading="lazy">` : ''}
                                <span class="nombre-ciudad-tarjeta">${provs[pid].nombre}</span>
                            </div>
                        `).join('')}
                        </div>
                    </div>
                `;
                lucide.createIcons();
                contenedor.querySelectorAll('.tarjeta-ciudad[data-prov-id]').forEach((tarjeta) => {
                    tarjeta.addEventListener('contextmenu', (event) => {
                        abrirMenuContextualPortada(event, tarjeta.dataset.paisId, tarjeta.dataset.provId);
                    });
                });
                return;
            }

            // Si ya se pasó una ciudad, vamos directo al detalle
            window.abrirAlbumDetalle(idPais, idProvincia);
        };

        window.mostrarSelectorNuevaCiudad = function(idPais) {
            const pais = paisesVisitados[idPais];
            const btnAgregarCiudad = document.getElementById(`btn-agregar-ciudad-${idPais}`);
            btnAgregarCiudad?.classList.add('btn-agregar-ciudad-activo');
            const modal = document.createElement('div');
            modal.className = "modal-nueva-ciudad";
            modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;";
            modal.innerHTML = `
                <div style="background:white; padding: 25px; border-radius:15px; width:100%; max-width:400px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                    <h3 style="margin-top:0; color: var(--secondary); display:flex; align-items:center; gap:8px;"><i data-lucide="map-pin"></i> Nueva ciudad en ${pais.nombre}</h3>
                    <p style="color: #546E7A; font-size: 0.95rem; margin-bottom: 15px;">
                    <select id="select-nueva-ciudad" style="width: 100%; padding: 12px; border: 1px solid #CFD8DC; border-radius: 8px; font-family: inherit; margin-bottom: 20px; box-sizing: border-box; outline: none; font-size: 1rem;">
                        <option value="" disabled selected>Cargando ciudades...</option>
                    </select>
                    <div style="display:flex; justify-content: flex-end; gap: 10px;">
                        <button id="btn-cancelar-nueva-ciudad" style="background: #ECEFF1; color: #546E7A; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">Cancelar</button>
                        <button id="btn-guardar-ciudad" style="background: var(--secondary); color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">Guardar Ciudad</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            lucide.createIcons();
            const cerrarModalNuevaCiudad = () => {
                modal.remove();
                btnAgregarCiudad?.classList.remove('btn-agregar-ciudad-activo');
            };
            document.getElementById('btn-cancelar-nueva-ciudad')?.addEventListener('click', cerrarModalNuevaCiudad);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) cerrarModalNuevaCiudad();
            });

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
                    registrarCambioLocal(true);
                    cerrarModalNuevaCiudad();
                    window.abrirAlbum(idPais);
                } else {
                    alert("elegí una ciudad primero para que guardemos el recuerdo.");
                }
            };
        };

        window.abrirAlbumDetalle = function(idPais, idProvincia, submodo = null) {
            limpiarPlayersMusica();
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
            actualizarVisibilidadEncabezadoRecuerdos(!!idProvincia);

            if (!objDestino.albumes) objDestino.albumes = [];
            if (!objDestino.historias) objDestino.historias = [];

            const scrollArea = document.getElementById('scroll-recuerdos');
            const tieneMusica = !!objDestino.musica;
            const videoIdMusica = tieneMusica && typeof window.extraerIDYoutube === 'function'
                ? window.extraerIDYoutube(objDestino.musica)
                : null;
            const musicaValida = !!videoIdMusica;
            const idPlayerMusica = obtenerIdPlayerMusica(idPais, idProvincia);

            // Lógica de navegación: si estamos dentro de una ciudad, "Volver" nos lleva a la lista de ciudades.
            const btnVolverAccion = idProvincia ? `abrirAlbum('${idPais}')` : `renderizarPantallaRecuerdos()`;
            const paramProv = idProvincia ? `'${idProvincia}'` : `null`;
            const nombreCiudad = idProvincia ? objDestino.nombre : nombreTitulo;
            const nombrePais = idProvincia ? pais.nombre : '';
            const nombreLeyendaMusica = (idProvincia ? objDestino.nombre : pais.nombre || nombreTitulo).trim();
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
                    <h2 class="titulo-memorias-ciudad">Memorias de ${nombreCiudad}${idProvincia ? ` <span class="pais-parentesis">(${nombrePais})</span>` : ''}</h2>
                </div>
                <div id="seccion-musica" class="seccion-musica-metal">
                    <div id="vista-musica-guardada" class="vista-musica-metal" style="display: ${tieneMusica ? 'flex' : 'none'};">
                        <div style="flex: 1;">
                            ${musicaValida ? `
                                <div class="player-musica-oculto-metal">
                                    <div class="barra-controles-metal">
                                        <span class="leyenda-musica-metal">${nombreLeyendaMusica} se escuchaba así:</span>
                                        <div class="acciones-musica-metal">
                                            <button type="button" class="btn-metal-play" onclick="window.controlMusicaMetal('play')" title="Play" aria-label="Play"><span class="metal-glyph" aria-hidden="true">▶</span></button>
                                            <button type="button" class="btn-metal-pause" onclick="window.controlMusicaMetal('pause')" title="Pausa" aria-label="Pausa"><span class="metal-glyph" aria-hidden="true">❚❚</span></button>
                                            <button type="button" class="btn-metal-restart" onclick="window.controlMusicaMetal('restart')" title="Reiniciar" aria-label="Reiniciar"><span class="metal-glyph" aria-hidden="true">↺</span></button>
                                            <button type="button" class="btn-metal-edit" onclick="window.abrirEditorUrlMusica('${idPais}', ${paramProv})" title="Editar" aria-label="Editar"><span class="metal-glyph" aria-hidden="true">✎</span></button>
                                        </div>
                                    </div>
                                    <iframe
                                        id="${idPlayerMusica}"
                                        src="https://www.youtube.com/embed/${videoIdMusica}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1"
                                        title="Música para la memoria"
                                        id="iframe-musica-${idPais}-${idProvincia || 'pais'}" class="iframe-musica-audio"
                                        loading="lazy"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowfullscreen>
                                    </iframe>
                                </div>
                            ` : `
                                <div class="mensaje-musica-invalida-metal">
                                    <i data-lucide="alert-triangle"></i>
                                    <span>El enlace de YouTube guardado es inválido. Pegá una URL válida para corregirlo.</span>
                                </div>
                            `}
                        </div>
                    </div>
                    
                    <div id="input-musica" class="input-musica-metal" style="display: ${!tieneMusica || !musicaValida ? 'flex' : 'none'};">
                        <div class="campo-musica-metal">
                            <i data-lucide="music" class="icono-musica-metal"></i>
                            <input type="text" id="url-musica" placeholder="Pega el link de la canción..." class="texto-musica-metal">
                        </div>
                        <button onclick="guardarMusica('${idPais}', ${paramProv})" class="btn-guardar-musica-metal">Guardar</button>
                    </div>

                    <div id="editor-url-musica" class="editor-url-musica-metal" style="display:none;">
                        <h4 class="titulo-editor-musica-metal">Editar URL del video</h4>
                        <div class="campo-musica-metal">
                            <i data-lucide="music" class="icono-musica-metal"></i>
                            <input type="text" id="url-musica-editar" placeholder="Pega el link de YouTube..." class="texto-musica-metal">
                        </div>
                        <div class="acciones-editor-musica-metal">
                            <button type="button" onclick="window.guardarMusicaEditada('${idPais}', ${paramProv})" class="btn-guardar-musica-metal">Guardar</button>
                            <button type="button" onclick="window.cerrarEditorUrlMusica()" class="btn-cancelar-musica-metal">Cancelar</button>
                        </div>
                    </div>
                </div>
                <div class="tabs-memoria-metal">
                    <button
                        type="button"
                        class="btn-tab-memoria tab-ver ${submodoActual === 'ver' ? 'activo' : ''}"
                        onclick="cambiarSubmodoRecuerdos('ver', '${idPais}', ${paramProv})">
                        <i data-lucide="images"></i> Ver Recuerdos
                    </button>
                    <button
                        type="button"
                        class="btn-tab-memoria tab-nuevo ${submodoActual === 'nuevo' ? 'activo' : ''}"
                        onclick="cambiarSubmodoRecuerdos('nuevo', '${idPais}', ${paramProv})">
                        <i data-lucide="plus-circle"></i> Agregar Memoria
                    </button>
                </div>
                ${bloqueNuevo}

                <div id="lista-memorias-guardadas" style="display: ${submodoActual === 'nuevo' ? 'none' : 'grid'}; grid-template-columns: repeat(auto-fit, minmax(220px, 260px)); justify-content: center; gap: 24px;">
                </div>
            `;

            if (submodoActual === 'nuevo') {
                cambiarSeccionRecuerdos(seccionNuevo, idPais, idProvincia);
            } else {
                actualizarVistaRecuerdosSoloLectura(idPais, idProvincia);
            }
            lucide.createIcons();
            if (musicaValida) {
                inicializarPlayerMusica(idPlayerMusica, videoIdMusica);
            }
        };

        window.cambiarSubmodoRecuerdos = function(submodo, idPais, idProvincia = null) {
            const destino = submodo === 'nuevo' ? 'nuevo' : 'ver';
            estadoVistaRecuerdos.submodo = destino;
            window.abrirAlbumDetalle(idPais, idProvincia, destino);
        };


        let youtubeApiReadyPromise = null;
        let youtubeApiReadyResolverControles = null;
        const reproductoresMusica = new Map();

        function asegurarYoutubeAPI() {
            if (youtubeApiReadyPromise) return youtubeApiReadyPromise;
            youtubeApiReadyPromise = new Promise((resolve) => {
                youtubeApiReadyResolverControles = resolve;
            });

            if (window.YT && typeof window.YT.Player === 'function') {
                youtubeApiReadyResolverControles?.();
                return youtubeApiReadyPromise;
            }

            const scriptExistente = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
            if (!scriptExistente) {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(tag);
            }

            return youtubeApiReadyPromise;
        }

        const onYouTubeIframeAPIReadyPrevio = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function() {
            if (typeof onYouTubeIframeAPIReadyPrevio === 'function') {
                onYouTubeIframeAPIReadyPrevio();
            }
            if (typeof youtubeApiReadyResolverControles === 'function') {
                youtubeApiReadyResolverControles();
                youtubeApiReadyResolverControles = null;
            }
        };

        function actualizarEstadoControlesMusica(state, barra) {
            if (!barra) return;
            barra.classList.remove('is-playing', 'is-paused');
            if (state === window.YT?.PlayerState?.PLAYING) barra.classList.add('is-playing');
            if (state === window.YT?.PlayerState?.PAUSED) barra.classList.add('is-paused');
        }

        function prepararControlesMusica({ claveControl, iframeId, barraId }) {
            if (!claveControl || !iframeId || !barraId) return;
            const iframe = document.getElementById(iframeId);
            const barra = document.getElementById(barraId);
            if (!iframe || !barra) return;

            asegurarYoutubeAPI().then(() => {
                if (!document.getElementById(iframeId) || !document.getElementById(barraId)) return;

                const previo = reproductoresMusica.get(claveControl);
                if (previo?.player && typeof previo.player.destroy === 'function') {
                    previo.player.destroy();
                }

                const player = new window.YT.Player(iframeId, {
                    playerVars: {
                        origin: window.location.origin
                    },
                    events: {
                        onStateChange: (event) => actualizarEstadoControlesMusica(event.data, barra),
                        onReady: () => actualizarEstadoControlesMusica(window.YT.PlayerState.UNSTARTED, barra)
                    }
                });

                reproductoresMusica.set(claveControl, { player, barraId });
            }).catch(() => {
                if (barra) barra.classList.add('is-paused');
            });
        }

        window.controlMusica = function(claveControl, accion) {
            const entrada = reproductoresMusica.get(claveControl);
            const player = entrada?.player;
            if (!player || typeof player.getPlayerState !== 'function') return;

            if (accion === 'play') player.playVideo();
            if (accion === 'pause') player.pauseVideo();
            if (accion === 'restart') player.seekTo(0, true), player.playVideo();

            const barra = document.getElementById(entrada.barraId);
            actualizarEstadoControlesMusica(player.getPlayerState(), barra);
        };

        window.extraerIDYoutube = function(url) {
            const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
            const match = url.match(regExp);
            return (match && match[7].length === 11) ? match[7] : null;
        };

        window.controlMusicaMetal = function(accion) {
            const iframe = document.querySelector('#seccion-musica .iframe-musica-audio');
            if (!iframe || !iframe.contentWindow) return;

            if (accion === 'restart') {
                iframe.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'seekTo',
                    args: [0, true]
                }), '*');
                iframe.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'playVideo',
                    args: []
                }), '*');
                return;
            }

            const comando = accion === 'pause' ? 'pauseVideo' : 'playVideo';
            iframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: comando,
                args: []
            }), '*');
        };

        window.abrirEditorUrlMusica = function(idPais, idProvincia = null) {
            const editor = document.getElementById('editor-url-musica');
            const input = document.getElementById('url-musica-editar');
            if (!editor || !input) return;

            const objDestino = idProvincia ? provinciasVisitadas?.[idPais]?.[idProvincia] : paisesVisitados?.[idPais];
            input.value = (objDestino?.musica || '').trim();
            editor.style.display = 'flex';
            input.focus();
            input.select();
        };

        window.cerrarEditorUrlMusica = function() {
            const editor = document.getElementById('editor-url-musica');
            if (!editor) return;
            editor.style.display = 'none';
        };

        window.guardarMusicaEditada = function(idPais, idProvincia = null) {
            const input = document.getElementById('url-musica-editar');
            if (!input) return;
            const nuevaUrl = input.value.trim();
            if (!nuevaUrl) {
                alert("Por favor, ingresa un enlace válido de YouTube.");
                return;
            }
            if (!nuevaUrl.includes('youtube.com') && !nuevaUrl.includes('youtu.be')) {
                alert("Por favor, ingresa un enlace válido de YouTube.");
                return;
            }

            const objDestino = idProvincia ? provinciasVisitadas?.[idPais]?.[idProvincia] : paisesVisitados?.[idPais];
            if (!objDestino) return;
            objDestino.musica = nuevaUrl;
            window.abrirAlbumDetalle(idPais, idProvincia);
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

            let html = '';
            if (albumes.length === 0 && historias.length === 0) {
                html = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><i data-lucide="camera-off" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i><p>Aún no hay recuerdos guardados para este destino.</p></div>';
            } else {
                albumes.forEach((album, index) => {
                    html += construirTarjetaMemoria('drive', album, {
                        idPais,
                        idProvincia,
                        index
                    });
                });

                historias.forEach((h, index) => {
                    html += construirTarjetaMemoria('historia', h, {
                        idPais,
                        idProvincia,
                        index
                    });
                });
            }

            contenedor.innerHTML = html;
            lucide.createIcons();
        };

        window.actualizarVistaAlbumes = function(idPais, idProvincia = null, vista = 'drive') {
            const contenedor = document.getElementById('lista-memorias-guardadas');
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            contenedor.innerHTML = '';

            if (vista === 'drive') {
                const albumes = objDestino.albumes || [];
                if (albumes.length === 0) {
                    contenedor.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><i data-lucide="folder-x" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i><p>No hay carpetas compartidas aún.</p></div>';
                } else {
                    albumes.forEach((album, index) => {
                        contenedor.innerHTML += construirTarjetaMemoria('drive', album, {
                            idPais,
                            idProvincia,
                            index
                        });
                    });
                }
            } else {
                const historias = objDestino.historias || [];
                if (historias.length === 0) {
                    contenedor.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><i data-lucide="scroll" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i><p>Aún no has escrito historias.</p></div>';
                } else {
                    historias.forEach((h, index) => {
                        contenedor.innerHTML += construirTarjetaMemoria('historia', h, {
                            idPais,
                            idProvincia,
                            index
                        });
                    });
                }
            }
            lucide.createIcons();
            ajustarTitulosMemoria();
        };

        function ajustarTitulosMemoria() {
            const titulos = document.querySelectorAll('#lista-memorias-guardadas .titulo-memoria');
            titulos.forEach((titulo) => {
                titulo.style.fontSize = '';
                let tamano = parseFloat(window.getComputedStyle(titulo).fontSize);
                const minTamano = 12;
                while (titulo.scrollHeight > titulo.clientHeight + 1 && tamano > minTamano) {
                    tamano -= 0.5;
                    titulo.style.fontSize = `${tamano}px`;
                }
            });
        }

        window.addEventListener('resize', () => {
            ajustarTitulosMemoria();
        });

        function construirTarjetaMemoria(tipo, item, contexto) {
            const { idPais, idProvincia, index } = contexto;
            const paramProv = idProvincia ? `'${idProvincia}'` : `null`;
            const placeholder = tipo === 'drive'
                ? 'https://via.placeholder.com/500?text=Sin+Portada'
                : 'https://via.placeholder.com/500?text=Sin+Imagen';
            const imagen = tipo === 'drive' ? (item.portada || placeholder) : (item.img || placeholder);
            const titulo = tipo === 'drive' ? (item.nombre || 'Sin nombre') : (item.titulo || 'Sin título');
            const claseTitulo = tipo === 'drive' ? 'drive' : 'historia';
            const claseTipoMemoria = tipo === 'drive' ? 'memoria-drive' : 'memoria-historia';
            const abrir = tipo === 'drive'
                ? `abrirMemoriaDrive('${idPais}', ${paramProv}, ${index})`
                : `leerHistoria('${idPais}', ${paramProv}, ${index})`;

            return `
                <article class="tarjeta-memoria-cuadrada ${claseTipoMemoria}" onclick="${abrir}" oncontextmenu="abrirMenuMemoria(event, '${idPais}', ${paramProv}, ${index}, '${tipo}')">
                    <div class="imagen-memoria" style="background-image: url('${imagen}');"></div>
                    <footer class="pie-memoria">
                        <h3 class="titulo-memoria ${claseTitulo}" title="${titulo}">${titulo}</h3>
                    </footer>
                </article>`;
        }

        function leerArchivoComoDataUrl(archivo) {
            return new Promise((resolve, reject) => {
                if (!(archivo instanceof File)) {
                    reject(new Error("Archivo inválido."));
                    return;
                }

                if (!archivo.type.startsWith('image/')) {
                    reject(new Error("El archivo debe ser una imagen."));
                    return;
                }

                if (archivo.size <= LIMITE_IMAGEN_FIREBASE_BYTES) {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(new Error("No se pudo leer el archivo de portada."));
                    reader.onabort = () => reject(new Error("La lectura del archivo fue cancelada."));
                    reader.readAsDataURL(archivo);
                    return;
                }

                comprimirImagenParaFirebase(archivo, LIMITE_IMAGEN_FIREBASE_BYTES)
                    .then(resolve)
                    .catch(() => reject(new Error("La imagen es demasiado grande. Usa una imagen más liviana.")));
            });
        }

        function comprimirImagenParaFirebase(archivo, maxBytes = LIMITE_IMAGEN_FIREBASE_BYTES) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (evento) => {
                    const imagen = new Image();
                    imagen.onload = () => {
                        let ancho = imagen.naturalWidth || imagen.width;
                        let alto = imagen.naturalHeight || imagen.height;
                        const maxDimension = 1280;

                        if (ancho > maxDimension || alto > maxDimension) {
                            const escala = Math.min(maxDimension / ancho, maxDimension / alto);
                            ancho = Math.max(1, Math.round(ancho * escala));
                            alto = Math.max(1, Math.round(alto * escala));
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = ancho;
                        canvas.height = alto;
                        const contexto = canvas.getContext('2d');
                        if (!contexto) {
                            reject(new Error("No se pudo procesar la imagen."));
                            return;
                        }

                        contexto.drawImage(imagen, 0, 0, ancho, alto);
                        const calidades = [0.82, 0.72, 0.62, 0.52, 0.42];

                        const intentarCalidad = (indice) => {
                            if (indice >= calidades.length) {
                                reject(new Error("No se pudo comprimir la imagen lo suficiente."));
                                return;
                            }

                            const dataUrl = canvas.toDataURL('image/jpeg', calidades[indice]);
                            if (estimarBytesDataUrl(dataUrl) <= maxBytes) {
                                resolve(dataUrl);
                                return;
                            }
                            intentarCalidad(indice + 1);
                        };

                        intentarCalidad(0);
                    };
                    imagen.onerror = () => reject(new Error("No se pudo cargar la imagen seleccionada."));
                    imagen.src = evento.target.result;
                };
                reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
                reader.onabort = () => reject(new Error("La lectura del archivo fue cancelada."));
                reader.readAsDataURL(archivo);
            });
        }

        window.obtenerImagenPortada = function(idInputUrl, idInputArchivo) {
            const url = document.getElementById(idInputUrl)?.value?.trim() || '';
            const inputArchivo = document.getElementById(idInputArchivo);
            const archivo = inputArchivo && inputArchivo.files ? inputArchivo.files[0] : null;

            if (!archivo) return Promise.resolve(url);
            return leerArchivoComoDataUrl(archivo);
        };

        function mostrarToastExito(mensaje) {
            const toastAnterior = document.getElementById('toast-exito-recuerdos');
            if (toastAnterior) toastAnterior.remove();

            const toast = document.createElement('div');
            toast.id = 'toast-exito-recuerdos';
            toast.textContent = mensaje;
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #1f7a4d;
                color: #fff;
                padding: 10px 14px;
                border-radius: 10px;
                box-shadow: 0 8px 22px rgba(0,0,0,0.2);
                z-index: 1200;
                font-weight: 600;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.18s ease, transform 0.18s ease;
            `;

            document.body.appendChild(toast);
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(8px)';
                setTimeout(() => toast.remove(), 200);
            }, 1800);
        }

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
            registrarCambioLocal(true);
            estadoVistaRecuerdos.submodo = 'ver';
            mostrarToastExito('Historia guardada con éxito.');
            window.abrirAlbumDetalle(idPais, idProvincia, 'ver');
        };

        window.leerHistoria = function(idPais, idProvincia = null, index) {
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            const h = objDestino.historias[index];
            const modal = document.createElement('div');
            modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;";
            modal.innerHTML = `
                <div style="background:white; width:100%; max-width:600px; max-height:90vh; border-radius:20px; overflow-y:auto; position:relative; padding-bottom:30px;">
                    <button onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:15px; right:15px; background:rgba(0,0,0,0.5); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-weight:bold; z-index:10;">X</button>
                    <div style="width:100%; height:250px; background:url('${h.img}') center/contain no-repeat; background-color:#f3f6fa;"></div>
                    <div style="padding:30px;">
                        <span style="color:var(--primary); font-weight:bold; font-size:0.8rem;">${h.fecha}</span>
                        <h2 style="margin-top:5px; color: #263238;">${h.titulo}</h2>
                        <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                        <p style="white-space: pre-wrap; line-height:1.6; color:#455A64;">${h.texto}</p>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        };

        window.abrirMemoriaDrive = function(idPais, idProvincia = null, index) {
            const destino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
            const album = destino?.albumes?.[index];
            const urlDrive = resolverUrlDriveAlbum(album);
            const titulo = album?.nombre || "Carpeta compartida";

            const tipoMultimedia = resolverTipoMultimedia(album, urlDrive);
            if (tipoMultimedia === 'imagen') {
                const urlImagen = obtenerUrlMultimediaDirecta(album?.portada || urlDrive, 'imagen');
                mostrarModalVistaImagen(urlImagen, titulo);
                return;
            }

            if (tipoMultimedia === 'video') {
                const urlVideo = obtenerUrlMultimediaDirecta(urlDrive || album?.portada, 'video');
                mostrarModalVistaVideo(urlVideo, titulo);
                return;
            }

            if (!urlDrive) {
                alert("No se encontró un enlace válido para esta memoria.");
                return;
            }
            mostrarModalVistaDrive(urlDrive, titulo);
        };

        function resolverTipoMultimedia(album, urlDrive = "") {
            const portada = String(album?.portada || "").trim();
            const enlace = String(urlDrive || "").trim();
            const extensionVideo = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;
            const extensionImagen = /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

            if (extensionVideo.test(enlace) || extensionVideo.test(portada)) return 'video';
            if (!portada) return null;
            if (!enlace) return 'imagen';

            const enlaceEsCarpetaDrive = /drive\.google\.com\/.*\/folders\//i.test(enlace) || /embeddedfolderview/i.test(enlace);
            if (enlaceEsCarpetaDrive) return null;

            const enlacePareceImagen = extensionImagen.test(enlace) || /^data:image\//i.test(enlace);
            const portadaPareceImagen = extensionImagen.test(portada) || /^data:image\//i.test(portada);

            if (enlacePareceImagen || portadaPareceImagen) return 'imagen';
            if (/drive\.google\.com\/file\/d\//i.test(enlace) && !/\/preview/i.test(enlace)) return 'imagen';
            return null;
        }

        function convertirUrlDriveDirecta(url = "", tipo = "imagen") {
            const valor = String(url || "").trim();
            if (!valor || !valor.includes("drive.google.com")) return valor;

            const idDrive = extraerIdDriveDesdeUrl(valor);
            if (!idDrive) return valor;

            const exportacion = tipo === "video" ? "download" : "view";
            return `https://drive.google.com/uc?export=${exportacion}&id=${idDrive}`;
        }

        function obtenerUrlMultimediaDirecta(url = "", tipo = "imagen") {
            const valor = String(url || "").trim();
            if (!valor) return "";
            return convertirUrlDriveDirecta(valor, tipo);
        }

        function construirUrlApiCarpetaDrive(idCarpeta = "") {
            const id = String(idCarpeta || "").trim();
            const endpointBase = String(CONFIG_VISTA_DRIVE?.apiFolderImagesEndpoint || "").trim();
            if (!id || !endpointBase) return "";

            if (window?.location?.hostname?.endsWith('github.io') && endpointBase.startsWith('/api/')) {
                return "";
            }

            const separador = endpointBase.includes('?') ? '&' : '?';
            return `${endpointBase}${separador}id=${encodeURIComponent(id)}`;
        }

        async function obtenerArchivosPublicosDeCarpetaDrive(urlDrive = "", { signal } = {}) {
            const idCarpeta = extraerIdDriveDesdeUrl(urlDrive);
            if (!idCarpeta) return { archivos: [], error: null };
            const urlApi = construirUrlApiCarpetaDrive(idCarpeta);
            if (!urlApi) return { archivos: [], error: null };

            try {
                const respuesta = await fetch(urlApi, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal
                });
                if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

                const payload = await respuesta.json();
                const archivosPayload = Array.isArray(payload?.files) ? payload.files : [];
                const idsPayload = Array.isArray(payload?.ids) ? payload.ids : [];

                const archivos = archivosPayload
                    .map((archivo) => {
                        const id = String(archivo?.id || '').trim();
                        if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return null;
                        return {
                            id,
                            name: String(archivo?.name || '').trim(),
                            mimeType: String(archivo?.mimeType || '').trim()
                        };
                    })
                    .filter(Boolean);

                if (archivos.length) {
                    const unicos = [];
                    const vistos = new Set();
                    archivos.forEach((archivo) => {
                        if (vistos.has(archivo.id)) return;
                        vistos.add(archivo.id);
                        unicos.push(archivo);
                    });
                    return { archivos: unicos, error: null };
                }

                const idsValidos = idsPayload
                    .map((id) => String(id || '').trim())
                    .filter((id) => /^[a-zA-Z0-9_-]{10,}$/.test(id));

                return {
                    archivos: Array.from(new Set(idsValidos)).map((id) => ({ id, name: '', mimeType: '' })),
                    error: null
                };
            } catch (error) {
                console.warn('[Drive] No se pudieron cargar archivos de la carpeta mediante la API propia.', error);
                return { archivos: [], error };
            }
        }

        function construirGaleriaDriveHtml(archivos = []) {
            if (!Array.isArray(archivos) || !archivos.length) return '';

            const escAttr = (valor = "") => String(valor)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            const tarjetas = archivos
                .filter((archivo) => archivo && typeof archivo === 'object' && String(archivo.id || '').trim())
                .map((archivo, index) => {
                    const idArchivo = String(archivo.id || '').trim();
                    const mimeType = String(archivo.mimeType || '').trim().toLowerCase();
                    const esVideo = mimeType.startsWith('video/');
                    const urlImagen = `https://drive.google.com/uc?export=view&id=${idArchivo}`;
                    const etiquetaBase = String(archivo.name || '').trim() || (esVideo ? `Video ${index + 1}` : `Foto ${index + 1}`);
                    const etiqueta = escaparHtmlPlano(etiquetaBase);
                    return `
                        <div
                            class="tarjeta-foto-drive ${esVideo ? 'tarjeta-foto-drive-video' : ''}"
                            aria-label="${escAttr(etiquetaBase)}">
                            <img src="${escAttr(urlImagen)}" alt="${etiqueta}" loading="lazy" referrerpolicy="no-referrer">
                        </div>
                    `;
                }).join('');

            return `<div class="galeria-fotos-drive">${tarjetas}</div>`;
        }

        function cerrarModalVistaDrive() {
            if (controladorCargaVistaDrive) {
                controladorCargaVistaDrive.abort();
                controladorCargaVistaDrive = null;
            }
            document.getElementById('modal-vista-drive')?.remove();
            document.body.classList.remove('sin-scroll');
            document.removeEventListener('keydown', manejarEscapeModalDrive);
        }

        function manejarEscapeModalDrive(event) {
            if (event.key === 'Escape') cerrarModalVistaDrive();
        }

        async function mostrarModalVistaDrive(urlDrive, titulo = "Carpeta compartida") {
            cerrarModalVistaDrive();

            const urlEmbebida = construirUrlDriveEmbebida(urlDrive);
            const resultadoImagenes = await obtenerArchivosPublicosDeCarpetaDrive(urlDrive);
            const archivos = resultadoImagenes?.archivos || [];
            const errorConsultaImagenes = Boolean(resultadoImagenes?.error);
            const galeriaFotos = construirGaleriaDriveHtml(archivos);
            const permitirAbrirEnPestana = Boolean(CONFIG_VISTA_DRIVE?.permitirAbrirEnPestana);
            const modal = document.createElement('div');
            modal.id = 'modal-vista-drive';
            modal.className = 'modal-vista-drive-fondo';

            modal.innerHTML = `
                <div class="modal-vista-drive-contenido" role="dialog" aria-modal="true" aria-label="Vista previa de Drive">
                    <div class="modal-vista-drive-header">
                        <h3 class="modal-vista-drive-titulo">${titulo}</h3>
                        <button type="button" class="btn-cerrar-modal-memoria" aria-label="Cerrar">×</button>
                    </div>
                    <div class="modal-vista-drive-cuerpo">
                        ${galeriaFotos ? `
                            ${galeriaFotos}
                        ` : errorConsultaImagenes ? `
                            <div class="mensaje-vista-drive">
                                <i data-lucide="alert-circle"></i>
                                <p>No pudimos cargar la vista previa en este momento. Puedes abrir la carpeta en una pestaña nueva.</p>
                            </div>
                        ` : urlEmbebida ? `
                            <div class="contenedor-embed-drive">
                                <iframe
                                    class="iframe-vista-drive"
                                    src="${urlEmbebida}"
                                    title="Contenido compartido de Google Drive"
                                    loading="lazy"
                                    referrerpolicy="no-referrer-when-downgrade"
                                    allow="clipboard-write">
                                </iframe>
                                <p class="mensaje-permisos-drive">No se puede previsualizar aquí por permisos del proveedor.</p>
                            </div>
                        ` : `
                            <div class="mensaje-vista-drive">
                                <i data-lucide="alert-circle"></i>
                                <p>No se puede previsualizar aquí por permisos del proveedor.</p>
                            </div>
                        `}
                    </div>
                    <div class="modal-vista-drive-acciones">
                        ${permitirAbrirEnPestana ? `<button type="button" class="btn-modal-memoria link" id="btn-drive-externo">Abrir en pestaña</button>` : ``}
                        <button type="button" class="btn-modal-memoria primario" id="btn-drive-cerrar">Cerrar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            document.body.classList.add('sin-scroll');
            document.addEventListener('keydown', manejarEscapeModalDrive);
            lucide.createIcons();

            const btnCerrarSuperior = modal.querySelector('.btn-cerrar-modal-memoria');
            const btnCerrar = modal.querySelector('#btn-drive-cerrar');
            const btnExterno = modal.querySelector('#btn-drive-externo');
            const contenedorCuerpo = modal.querySelector('.modal-vista-drive-cuerpo');

            btnCerrarSuperior?.addEventListener('click', cerrarModalVistaDrive);
            btnCerrar?.addEventListener('click', cerrarModalVistaDrive);
            btnExterno?.addEventListener('click', () => window.open(urlDrive, '_blank', 'noopener,noreferrer'));
            modal.addEventListener('click', (event) => {
                if (event.target === modal) cerrarModalVistaDrive();
            });

            const renderizarContenidoModal = (html) => {
                if (!contenedorCuerpo || !modal.isConnected) return;
                contenedorCuerpo.innerHTML = html;
                lucide.createIcons();
            };

            const timeoutMs = 5000;
            const controlador = new AbortController();
            controladorCargaVistaDrive = controlador;
            const timeoutId = setTimeout(() => controlador.abort(), timeoutMs);

            (async () => {
                try {
                    const resultado = await obtenerArchivosPublicosDeCarpetaDrive(urlDrive, { signal: controlador.signal });
                    if (!modal.isConnected || controlador.signal.aborted) return;

                    const galeriaFotos = construirGaleriaDriveHtml(resultado?.archivos || []);
                    if (galeriaFotos) {
                        renderizarContenidoModal(galeriaFotos);
                        return;
                    }

                    if (urlEmbebida) {
                        renderizarContenidoModal(`
                            <iframe
                                class="iframe-vista-drive"
                                src="${urlEmbebida}"
                                title="Contenido compartido de Google Drive"
                                loading="lazy"
                                referrerpolicy="no-referrer-when-downgrade"
                                allow="clipboard-write">
                            </iframe>
                        `);
                        return;
                    }

                    renderizarContenidoModal(`
                        <div class="mensaje-vista-drive">
                            <i data-lucide="alert-circle"></i>
                            <p>No pudimos previsualizar este enlace dentro de la app.</p>
                        </div>
                    `);
                } catch (_) {
                    if (!modal.isConnected) return;
                    renderizarContenidoModal(`
                        <div class="mensaje-vista-drive">
                            <i data-lucide="info"></i>
                            <p>No logramos cargar el contenido ahora. Puedes intentar de nuevo o abrirlo en una pestaña.</p>
                        </div>
                    `);
                } finally {
                    clearTimeout(timeoutId);
                    if (controladorCargaVistaDrive === controlador) {
                        controladorCargaVistaDrive = null;
                    }
                }
            })();
        }

        function obtenerElementosLightbox() {
            return {
                contenedor: document.getElementById('media-lightbox'),
                dialogo: document.querySelector('#media-lightbox .media-lightbox__dialog'),
                btnCerrar: document.getElementById('media-lightbox-close'),
                imagen: document.getElementById('media-lightbox-image'),
                video: document.getElementById('media-lightbox-video'),
                frameVideo: document.getElementById('media-lightbox-video-frame')
            };
        }

        function cerrarModalVistaImagen() {
            const { contenedor, imagen, video, frameVideo } = obtenerElementosLightbox();
            if (!contenedor) return;

            contenedor.classList.remove('activo');
            contenedor.setAttribute('aria-hidden', 'true');

            if (imagen) {
                imagen.src = '';
                imagen.alt = '';
                imagen.hidden = true;
            }

            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.load();
                video.hidden = true;
            }

            if (frameVideo) {
                frameVideo.removeAttribute('src');
                frameVideo.hidden = true;
            }

            document.body.classList.remove('sin-scroll');
            document.removeEventListener('keydown', manejarEscapeModalImagen);
        }

        function manejarEscapeModalImagen(event) {
            if (event.key === 'Escape') cerrarModalVistaImagen();
        }

        function inicializarEventosLightbox() {
            const { contenedor, btnCerrar } = obtenerElementosLightbox();
            if (!contenedor || contenedor.dataset.eventsReady === 'true') return;

            contenedor.addEventListener('click', (event) => {
                if (event.target === contenedor) cerrarModalVistaImagen();
            });
            btnCerrar?.addEventListener('click', cerrarModalVistaImagen);
            contenedor.dataset.eventsReady = 'true';
        }

        function mostrarModalVistaImagen(urlImagen, titulo = "Foto") {
            cerrarModalVistaImagen();

            if (!urlImagen) {
                alert("No se encontró una imagen para mostrar.");
                return;
            }

            inicializarEventosLightbox();
            const { contenedor, imagen, video, frameVideo } = obtenerElementosLightbox();
            if (!contenedor || !imagen || !video) return;

            video.hidden = true;
            video.pause();
            video.removeAttribute('src');
            video.load();
            if (frameVideo) {
                frameVideo.hidden = true;
                frameVideo.removeAttribute('src');
            }

            imagen.src = urlImagen;
            imagen.alt = titulo;
            imagen.hidden = false;

            contenedor.classList.add('activo');
            contenedor.setAttribute('aria-hidden', 'false');
            document.body.classList.add('sin-scroll');
            document.addEventListener('keydown', manejarEscapeModalImagen);
        }

        function mostrarModalVistaVideo(urlVideo, titulo = "Video") {
            cerrarModalVistaImagen();

            if (!urlVideo) {
                alert("No se encontró un video para mostrar.");
                return;
            }

            inicializarEventosLightbox();
            const { contenedor, dialogo, imagen, video, frameVideo } = obtenerElementosLightbox();
            if (!contenedor || !dialogo || !imagen || !video) return;

            let iframeVideo = frameVideo;
            if (!iframeVideo) {
                iframeVideo = document.createElement('iframe');
                iframeVideo.id = 'media-lightbox-video-frame';
                iframeVideo.className = 'media-lightbox__video media-lightbox__video-frame';
                iframeVideo.setAttribute('title', titulo);
                iframeVideo.setAttribute('loading', 'lazy');
                iframeVideo.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
                iframeVideo.setAttribute('referrerpolicy', 'no-referrer');
                iframeVideo.hidden = true;
                dialogo.appendChild(iframeVideo);
            }

            imagen.hidden = true;
            imagen.src = '';
            imagen.alt = '';

            video.hidden = true;
            video.pause();
            video.removeAttribute('src');
            video.load();

            iframeVideo.setAttribute('title', titulo);
            iframeVideo.src = urlVideo;
            iframeVideo.hidden = false;

            contenedor.classList.add('activo');
            contenedor.setAttribute('aria-hidden', 'false');
            document.body.classList.add('sin-scroll');
            document.addEventListener('keydown', manejarEscapeModalImagen);
        }

        function cerrarMenuMemoria() {
            document.getElementById('menu-contextual-memoria')?.remove();
        }

        function cerrarModalEditarMemoria() {
            document.getElementById('modal-editar-memoria')?.remove();
        }

        function abrirModalEditarMemoriaDrive(album, onGuardar) {
            cerrarModalEditarMemoria();

            const modal = document.createElement('div');
            modal.id = 'modal-editar-memoria';
            modal.className = 'modal-editar-memoria-fondo';
            modal.innerHTML = `
                <div class="modal-editar-memoria-contenido" role="dialog" aria-modal="true" aria-label="Editar memoria">
                    <button type="button" class="btn-cerrar-modal-memoria" aria-label="Cerrar">×</button>
                    <h3 class="titulo-modal-memoria">Editar memoria</h3>
                    <form id="form-editar-memoria">
                        <label class="label-modal-memoria" for="editar-memoria-nombre">Nombre:</label>
                        <input type="text" id="editar-memoria-nombre" class="input-modal-memoria" value="${(album?.nombre || '').replace(/"/g, '&quot;')}" required>

                        <label class="label-modal-memoria" for="editar-memoria-drive-url">Enlace (Drive/canción):</label>
                        <input type="url" id="editar-memoria-drive-url" class="input-modal-memoria" placeholder="https://..." value="${(album?.driveUrl || album?.url || '').replace(/"/g, '&quot;')}">

                        <label class="label-modal-memoria" for="editar-memoria-portada-url">URL de portada:</label>
                        <input type="url" id="editar-memoria-portada-url" class="input-modal-memoria" placeholder="https://..." value="${(album?.portada || '').replace(/"/g, '&quot;')}">

                        <label class="label-modal-memoria" for="editar-memoria-archivo">O Archivo de portada:</label>
                        <input type="file" id="editar-memoria-archivo" class="input-modal-memoria input-modal-archivo" accept="image/*">

                        <div class="acciones-modal-memoria">
                            <button type="button" class="btn-modal-memoria secundario">Cancelar</button>
                            <button type="submit" class="btn-modal-memoria primario">Guardar</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            const btnCerrar = modal.querySelector('.btn-cerrar-modal-memoria');
            const btnCancelar = modal.querySelector('.btn-modal-memoria.secundario');
            const form = modal.querySelector('#form-editar-memoria');
            const inputNombre = modal.querySelector('#editar-memoria-nombre');
            const inputDriveUrl = modal.querySelector('#editar-memoria-drive-url');
            const inputPortadaUrl = modal.querySelector('#editar-memoria-portada-url');
            const inputArchivo = modal.querySelector('#editar-memoria-archivo');

            btnCerrar.addEventListener('click', cerrarModalEditarMemoria);
            btnCancelar.addEventListener('click', cerrarModalEditarMemoria);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) cerrarModalEditarMemoria();
            });

            form.addEventListener('submit', async (event) => {
                event.preventDefault();

                const nombre = inputNombre.value.trim();
                if (!nombre) {
                    alert("El nombre no puede estar vacío.");
                    inputNombre.focus();
                    return;
                }

                let portadaFinal = album?.portada || "";
                const driveUrlFinal = (inputDriveUrl.value || "").trim();

                try {
                    if (inputArchivo.files?.[0]) {
                        portadaFinal = await leerArchivoComoDataUrl(inputArchivo.files[0]);
                    } else {
                        portadaFinal = normalizarPortadaUrl(inputPortadaUrl.value.trim());
                    }
                } catch (error) {
                    alert("No se pudo leer el archivo seleccionado.");
                    return;
                }

                onGuardar({ nombre, driveUrl: driveUrlFinal, portada: portadaFinal });
                cerrarModalEditarMemoria();
            });
        }

        function abrirModalEditarMemoriaHistoria(historia, onGuardar) {
            cerrarModalEditarMemoria();

            const modal = document.createElement('div');
            modal.id = 'modal-editar-memoria';
            modal.className = 'modal-editar-memoria-fondo';
            modal.innerHTML = `
                <div class="modal-editar-memoria-contenido" role="dialog" aria-modal="true" aria-label="Editar historia">
                    <button type="button" class="btn-cerrar-modal-memoria" aria-label="Cerrar">×</button>
                    <h3 class="titulo-modal-memoria">Editar historia</h3>
                    <form id="form-editar-historia-memoria">
                        <label class="label-modal-memoria" for="editar-historia-titulo">Título:</label>
                        <input type="text" id="editar-historia-titulo" class="input-modal-memoria" required>

                        <label class="label-modal-memoria" for="editar-historia-texto">Texto:</label>
                        <textarea id="editar-historia-texto" class="input-modal-memoria" rows="8" required></textarea>

                        <label class="label-modal-memoria" for="editar-historia-img-url">Imagen (URL):</label>
                        <input type="url" id="editar-historia-img-url" class="input-modal-memoria" placeholder="https://...">

                        <label class="label-modal-memoria" for="editar-historia-img-file">O Archivo:</label>
                        <input type="file" id="editar-historia-img-file" class="input-modal-memoria input-modal-archivo" accept="image/*">

                        <div class="acciones-modal-memoria">
                            <button type="button" class="btn-modal-memoria secundario">Cancelar</button>
                            <button type="submit" class="btn-modal-memoria primario">Guardar</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            const btnCerrar = modal.querySelector('.btn-cerrar-modal-memoria');
            const btnCancelar = modal.querySelector('.btn-modal-memoria.secundario');
            const form = modal.querySelector('#form-editar-historia-memoria');
            const inputTitulo = modal.querySelector('#editar-historia-titulo');
            const inputTexto = modal.querySelector('#editar-historia-texto');
            const inputImgUrl = modal.querySelector('#editar-historia-img-url');
            const inputImgFile = modal.querySelector('#editar-historia-img-file');

            inputTitulo.value = historia?.titulo || "";
            inputTexto.value = historia?.texto || "";
            inputImgUrl.value = historia?.img || "";

            btnCerrar.addEventListener('click', cerrarModalEditarMemoria);
            btnCancelar.addEventListener('click', cerrarModalEditarMemoria);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) cerrarModalEditarMemoria();
            });

            form.addEventListener('submit', async (event) => {
                event.preventDefault();

                const titulo = inputTitulo.value.trim();
                const texto = inputTexto.value.trim();
                if (!titulo || !texto) {
                    alert("La historia necesita título y texto.");
                    if (!titulo) inputTitulo.focus();
                    else inputTexto.focus();
                    return;
                }

                let img = "";
                try {
                    img = await obtenerImagenPortada('editar-historia-img-url', 'editar-historia-img-file');
                } catch (error) {
                    alert(error.message || "No se pudo leer la imagen seleccionada.");
                    return;
                }

                onGuardar({ titulo, texto, img });
                cerrarModalEditarMemoria();
            });
        }

        window.abrirMenuMemoria = function(event, idPais, idProvincia = null, index, tipo) {
            event.preventDefault();
            event.stopPropagation();
            cerrarMenuMemoria();

            const menu = document.createElement('div');
            menu.id = 'menu-contextual-memoria';
            menu.className = 'menu-contextual-memoria';
            menu.innerHTML = `
                <button class="opcion-memoria editar" type="button" onclick="editarMemoria(event, '${idPais}', ${idProvincia ? `'${idProvincia}'` : 'null'}, ${index}, '${tipo}')">
                    <i data-lucide="pencil"></i> Editar
                </button>
                <button class="opcion-memoria eliminar" type="button" onclick="eliminarMemoria(event, '${idPais}', ${idProvincia ? `'${idProvincia}'` : 'null'}, ${index}, '${tipo}')">
                    <i data-lucide="trash-2"></i> Eliminar
                </button>
            `;
            document.body.appendChild(menu);
            lucide.createIcons();

            const margen = 10;
            const ancho = menu.offsetWidth || 175;
            const alto = menu.offsetHeight || 110;
            const maxX = window.innerWidth - ancho - margen;
            const maxY = window.innerHeight - alto - margen;
            menu.style.left = `${Math.max(margen, Math.min(event.clientX, maxX))}px`;
            menu.style.top = `${Math.max(margen, Math.min(event.clientY, maxY))}px`;
        };

        window.editarMemoria = function(event, idPais, idProvincia = null, index, tipo) {
            event.stopPropagation();
            cerrarMenuMemoria();
            let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];

            if (tipo === 'drive') {
                const album = objDestino.albumes[index];
                if (!album) return;
                abrirModalEditarMemoriaDrive(album, ({ nombre, driveUrl, portada }) => {
                    const albumActual = objDestino.albumes[index];
                    if (!albumActual) return;
                    albumActual.nombre = nombre || albumActual.nombre || 'Sin nombre';
                    albumActual.driveUrl = driveUrl || "";
                    albumActual.url = driveUrl || "";
                    albumActual.portada = portada || "";
                    registrarCambioLocal(true);

                    if (estadoVistaRecuerdos.submodo === 'nuevo') {
                        actualizarVistaAlbumes(idPais, idProvincia, estadoVistaRecuerdos.seccionNuevo || 'drive');
                    } else {
                        actualizarVistaRecuerdosSoloLectura(idPais, idProvincia);
                    }
                });
                return;
            } else {
                const historia = objDestino.historias[index];
                if (!historia) return;
                abrirModalEditarMemoriaHistoria(historia, ({ titulo, texto, img }) => {
                    objDestino.historias[index] = {
                        ...historia,
                        titulo: titulo || historia.titulo || 'Sin título',
                        texto: texto || historia.texto || '',
                        img: img || ""
                    };
                    registrarCambioLocal(true);

                    if (estadoVistaRecuerdos.submodo === 'nuevo') {
                        actualizarVistaAlbumes(idPais, idProvincia, estadoVistaRecuerdos.seccionNuevo || 'drive');
                    } else {
                        actualizarVistaRecuerdosSoloLectura(idPais, idProvincia);
                    }
                });
                return;
            }
        };

        window.eliminarMemoria = function(eventOrIdPais, idPaisOrProvincia = null, maybeIndex, maybeTipo) {
            let event = null;
            let idPais = eventOrIdPais;
            let idProvincia = idPaisOrProvincia;
            let index = maybeIndex;
            let tipo = maybeTipo;

            if (typeof eventOrIdPais === 'object' && eventOrIdPais?.stopPropagation) {
                event = eventOrIdPais;
                event.stopPropagation();
                idPais = idPaisOrProvincia;
                idProvincia = maybeIndex;
                index = arguments[3];
                tipo = arguments[4];
            }

            cerrarMenuMemoria();

            if (confirm("¿Seguro que quieres borrar esto?")) {
                let objDestino = idProvincia ? provinciasVisitadas[idPais][idProvincia] : paisesVisitados[idPais];
                if (tipo === 'drive') {
                    objDestino.albumes.splice(index, 1);
                } else {
                    objDestino.historias.splice(index, 1);
                }
                registrarCambioLocal(true);

                if (estadoVistaRecuerdos.submodo === 'nuevo') {
                    const vistaActiva = estadoVistaRecuerdos.seccionNuevo || 'drive';
                    actualizarVistaAlbumes(idPais, idProvincia, vistaActiva);
                } else {
                    actualizarVistaRecuerdosSoloLectura(idPais, idProvincia);
                }
            }
        };

        document.addEventListener('click', (event) => {
            const menu = document.getElementById('menu-contextual-memoria');
            if (menu && !menu.contains(event.target)) cerrarMenuMemoria();
        });
        document.addEventListener('contextmenu', (event) => {
            const menu = document.getElementById('menu-contextual-memoria');
            if (menu && !event.target.closest('.tarjeta-memoria-cuadrada')) cerrarMenuMemoria();
        });

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
            objDestino.albumes.push({ nombre, url, driveUrl: url, portada });
            registrarCambioLocal(true);
            estadoVistaRecuerdos.submodo = 'ver';
            mostrarToastExito('Memoria de Drive guardada con éxito.');
            window.abrirAlbumDetalle(idPais, idProvincia, 'ver');
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
                registrarCambioLocal(true);

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
                <div id="selector-nuevo-destino" class="selector-nuevo-destino">
                    <h3 class="titulo-selector-destino">¿A dónde quieres ir?</h3>
                    <select id="select-pais-nuevo" class="select-aventura-metal" style="margin-bottom: 15px;">
                        <option value="" disabled selected>Cargando países...</option>
                    </select>
                    <div class="acciones-selector-aventura">
                        <button onclick="confirmarNuevoDestino()" class="btn-aventura-metal btn-aventura-crear">Crear Aventura</button>
                        <button onclick="document.getElementById('selector-nuevo-destino').style.display='none'" class="btn-aventura-metal btn-aventura-cancelar">Cancelar</button>
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
    const portadaPais = obtenerPortadaPais(id);
    const portadaHTML = portadaPais
        ? `<img class="portada-tarjeta portada-tarjeta-pais" src="${portadaPais}" alt="Portada de ${pais.nombre}" loading="lazy">`
        : ``;

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
            ${portadaHTML}
            <div class="info-pais">
                <div>
                    <h3 class="nombre-pais-lista">${pais.nombre}</h3>
                    <span class="zonas-badge">${numMemorias} memorias</span>
                    ${provinciasHTML}
                </div>
            </div>
            <button class="btn-accion-pais" onclick="abrirAlbum('${id}')">
                Ver Galería <i data-lucide="chevron-right"></i>
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
            const boton = document.getElementById('btn-nueva-aventura-sonados');
            if (el) {
                el.style.display = 'block';
                el.scrollIntoView({ behavior: 'smooth' });
            }
            if (boton) boton.classList.add('activo-form');
        };

        window.ocultarSelectorNuevoDestino = function() {
            const el = document.getElementById('selector-nuevo-destino');
            const boton = document.getElementById('btn-nueva-aventura-sonados');
            if (el) el.style.display = 'none';
            if (boton) boton.classList.remove('activo-form');
        };

        window.confirmarNuevoDestino = function() {
            const select = document.getElementById('select-pais-nuevo');
            const selectCiudad = document.getElementById('select-ciudad-aventura');
            const id = select.value;
            const nombre = select.options[select.selectedIndex].text;
            const ciudadSeleccionada = selectCiudad ? (selectCiudad.value || '') : '';

            if (!id || id === "") return;

            // Ocultar el panel de selección para que no estorbe
            ocultarSelectorNuevoDestino();

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
            const modoPrevioMismoDestino = estadoVistaItinerario?.idPais === idPais
                ? estadoVistaItinerario?.modo
                : null;
            const modoInicial = modoPrevioMismoDestino === 'calendario' ? 'calendario' : 'lista';
            estadoVistaItinerario = { modo: modoInicial, idPais };
            const encabezadoSonados = document.getElementById('encabezado-sonados');
            if (encabezadoSonados) encabezadoSonados.style.display = 'none';
            const selectorNuevoDestino = document.getElementById('selector-nuevo-destino');
            if (selectorNuevoDestino) selectorNuevoDestino.style.display = 'none';

            scrollArea.innerHTML = `
                <div class="cabecera-itinerario-portada" style="background-image:url('${portadaActual || 'https://via.placeholder.com/1200x300?text=Sin+Portada'}')">
                    <div class="cabecera-detalle cabecera-itinerario-contenido">
                        <div style="display: flex; align-items: center; gap: 20px;">
                        <button class="btn-volver" onclick="renderizarPantallaSonados()" title="Volver a la lista">
                            <i data-lucide="arrow-left"></i>
                        </button>
                        <div class="titulo-destino-itinerario-wrap">
                            <h2 class="titulo-destino-itinerario">${nombrePrincipal}</h2>
                            ${escalasResumen ? `<div class="destino-escalas">(${escalasResumen})</div>` : ''}
                        </div>
                    </div>
                        
                        <div class="acciones-itinerario-superior">
                            <button id="btn-editar-portada-iti" class="btn-mini-accion-itinerario ${mostrarEditorPortada ? 'activo' : ''}" onclick="activarEdicionPortadaItinerario('${idPais}')" title="Editar URL de portada">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button id="btn-borrar-iti" class="btn-mini-accion-itinerario peligro" onclick="borrarItinerarioCompleto('${idPais}')" title="Eliminar todo el itinerario de este país">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="panel-creacion">
                    ${mostrarEditorPortada ? `
                    <div class="portada-itinerario-editor">
                        <input type="url" id="input-portada-itinerario" placeholder="URL de portada del itinerario..." value="${portadaActual}" style="flex:1; padding:10px 12px; border-radius:10px; border:2px solid #F8BBD0; font-family: inherit;">
                        <button class="btn-tipo-item" style="border-color:#F48FB1; color:#D81B60;" onclick="guardarPortadaItinerario('${idPais}')"><i data-lucide="image-plus"></i> Guardar portada</button>
                        <button class="btn-tipo-item" style="border-color:#9AA4B2; color:#263238;" onclick="cancelarEdicionPortadaItinerario('${idPais}')"><i data-lucide="x"></i> Cancelar</button>
                    </div>
                    ` : ''}
                    <div>
                        <h3 style="margin-top:0; color: #455A64;">Agregar nuevo paso:</h3>
                        <div class="botones-tipos">
                            <button class="btn-tipo-item btn-tipo-viaje" onclick="mostrarFormularioItinerario('viaje', this)"><i data-lucide="bus"></i> Viaje</button>
                            <button class="btn-tipo-item btn-tipo-hospedaje" onclick="manual_Hospedaje(this)"><i data-lucide="hotel"></i> Hospedaje</button>
                            <button class="btn-tipo-item btn-tipo-aventura" onclick="manual_Aventura(this)"><i data-lucide="mountain"></i> Aventura</button>
                            <button class="btn-tipo-item btn-tipo-restaurante" onclick="manual_Restaurante(this)"><i data-lucide="utensils"></i> Restaurante</button>
                        </div>
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
            cambiarModoItinerario(modoInicial);
        };

        window.cambiarModoItinerario = function(modo) {
            const modoNormalizado = modo === 'calendario' ? 'calendario' : 'lista';
            const idPais = estadoVistaItinerario?.idPais
                || (document.querySelector('.linea-tiempo[id^="linea-tiempo-"]')?.id || '').replace('linea-tiempo-', '');
            if (!idPais) return;

            estadoVistaItinerario.modo = modoNormalizado;
            estadoVistaItinerario.idPais = idPais;
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

        function normalizarFechaItinerario(valor = '') {
            const fecha = String(valor || '').trim();
            return esFechaActividadValida(fecha) ? fecha : '';
        }

        function normalizarDuracionViaje(valor = '') {
            const texto = String(valor || '').trim();
            if (!texto) return '0:30';
            const match = texto.match(/^(\d{1,2}):([03]0)$/);
            if (!match) return '0:30';
            return `${Number(match[1])}:${match[2]}`;
        }

        function limpiarNumeroMoneda(valor = '') {
            return String(valor || '').replace(/[^\d]/g, '');
        }

        function formatearMilesConPuntos(valor = '') {
            const limpio = limpiarNumeroMoneda(valor).replace(/^0+(?=\d)/, '');
            if (!limpio) return '';
            return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }

        function calcularPrecioTotalHospedaje(noches = 0, precioPorNoche = 0) {
            const nochesNumero = Math.max(0, Number(limpiarNumeroMoneda(noches)) || Number(noches) || 0);
            const precioNumero = Math.max(0, Number(limpiarNumeroMoneda(precioPorNoche)) || Number(precioPorNoche) || 0);
            return String(Math.round(nochesNumero * precioNumero));
        }

        function obtenerFechaLlegadaHospedaje(item = {}) {
            const fechaLlegada = String(item?.fechaLlegada || item?.fechaActividad || '').trim();
            return esFechaActividadValida(fechaLlegada) ? fechaLlegada : '';
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
            const fechaItem = item?.tipo === 'hospedaje'
                ? obtenerFechaLlegadaHospedaje(item)
                : String(item.fechaActividad || '').trim();
            if (esFechaActividadValida(fechaItem)) return fechaItem;
            const dia = obtenerDiaDeItem(destino, item);
            if (dia && esFechaActividadValida(dia.fecha)) return dia.fecha;
            return '';
        }

        function obtenerRangoTemporalItem(destino, item = {}) {
            let fechaInicio = obtenerFechaBaseItem(destino, item);
            let horaInicio = normalizarHoraItinerario(item.llegada);
            let horaFin = normalizarHoraItinerario(item.partida);
            let fechaFin = fechaInicio;

            if (item.tipo === 'viaje') {
                const fechaPartida = normalizarFechaItinerario(item.fechaPartida);
                const fechaLlegada = normalizarFechaItinerario(item.fechaLlegada);
                const horaPartida = normalizarHoraItinerario(item.partida);
                const horaLlegada = normalizarHoraItinerario(item.llegada);
                fechaInicio = fechaPartida || fechaInicio;
                fechaFin = fechaLlegada || fechaInicio;
                horaInicio = horaPartida || horaInicio;
                horaFin = horaLlegada || horaFin;
            }

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
            if (item._esSalidaViajeVirtual) {
                const indiceItem = Array.isArray(destino?.itinerario) ? destino.itinerario.findIndex((actual) => actual?.id === item?.id) : -1;
                const origen = item.origen || obtenerOrigenViajePorDefecto(destino, indiceItem);
                return {
                    icono: 'bus',
                    titulo: `${item.medio || 'Viaje'}`.toUpperCase(),
                    detalle: `ORIGEN ${origen.toUpperCase()}`,
                    horario: `Salida: ${normalizarHoraItinerario(item.partida) || normalizarHoraItinerario(item.llegada) || 'Sin horario'}`
                };
            }

            if (item._esLlegadaViajeVirtual) {
                return {
                    icono: 'bus',
                    titulo: `${item.medio || 'Viaje'}`.toUpperCase(),
                    detalle: `DESTINO ${obtenerDestinoViajeFormateado(item).toUpperCase()}`,
                    horario: `Llegada: ${normalizarHoraItinerario(item.llegada) || normalizarHoraItinerario(item.partida) || 'Sin horario'}`
                };
            }

            if (item._esCheckinHospedajeVirtual) {
                return {
                    icono: 'hotel',
                    titulo: (item.hotel || 'Hospedaje').toUpperCase(),
                    detalle: '',
                    horario: `Check-in: ${normalizarHoraItinerario(item.llegada) || 'Sin horario'}`
                };
            }

            if (item._esCheckoutVirtual) {
                const horaCheckout = normalizarHoraItinerario(item.partida) || 'Sin horario';
                return {
                    icono: 'hotel',
                    titulo: (item.hotel || 'Hospedaje').toUpperCase(),
                    detalle: '',
                    horario: `Check-out: ${horaCheckout}`
                };
            }

            const horario = formatearRangoTemporalItem(destino, item);
            if (item.tipo === 'viaje') {
                const indiceItem = Array.isArray(destino?.itinerario) ? destino.itinerario.findIndex((actual) => actual?.id === item?.id) : -1;
                const origen = item.origen || obtenerOrigenViajePorDefecto(destino, indiceItem);
                return {
                    icono: 'bus',
                    titulo: `Viaje en ${item.medio || 'transporte'}`,
                    detalle: `Origen: ${origen} → Destino: ${obtenerDestinoViajeFormateado(item)}`,
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
                    titulo: item.restaurante || 'Restaurante',
                    detalle: `${item.plato ? `Plato: ${item.plato} · ` : ''}Gasto estimado: ${formatearMonedaItinerario(item.costo ?? item.precio ?? 0)}`,
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

        function escaparHtmlPlano(texto = '') {
            return String(texto || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function esUrlValidaAbsoluta(valor = '') {
            return /^https?:\/\/\S+$/i.test(String(valor || '').trim());
        }

        window.cerrarModalVistaRapidaItinerario = function() {
            const modal = document.getElementById('modal-vista-rapida-itinerario');
            if (modal) modal.remove();
        };

        window.abrirModalVistaRapidaItinerario = function({ titulo = 'Detalle', contenido = '', subtitulo = '' } = {}) {
            cerrarModalVistaRapidaItinerario();
            const modal = document.createElement('div');
            modal.className = 'modal-vista-rapida-itinerario';
            modal.id = 'modal-vista-rapida-itinerario';
            modal.onclick = (event) => {
                if (event.target === modal) cerrarModalVistaRapidaItinerario();
            };

            modal.innerHTML = `
                <div class="modal-vista-rapida-itinerario-contenido" role="dialog" aria-modal="true" aria-label="${escaparHtmlPlano(titulo)}">
                    <div class="modal-vista-rapida-header">
                        <div>
                            <h3>${escaparHtmlPlano(titulo)}</h3>
                            ${subtitulo ? `<p>${escaparHtmlPlano(subtitulo)}</p>` : ''}
                        </div>
                        <button class="btn-cerrar-menu" onclick="cerrarModalVistaRapidaItinerario()" aria-label="Cerrar vista rápida">×</button>
                    </div>
                    <div class="modal-vista-rapida-body">${contenido}</div>
                </div>
            `;
            document.body.appendChild(modal);
            lucide.createIcons();
        };

        window.verUbicacionRestaurante = function(idPais, idItem) {
            const destino = destinosSonados[idPais];
            const item = Array.isArray(destino?.itinerario) ? destino.itinerario.find((actual) => String(actual?.id) === String(idItem)) : null;
            if (!item) return;
            const ubicacion = String(item.ubicacion || '').trim();
            const titulo = item.restaurante || 'Restaurante';
            const contenido = ubicacion
                ? (esUrlValidaAbsoluta(ubicacion)
                    ? `<a class="enlace-vista-rapida-itinerario" href="${ubicacion}" target="_blank" rel="noopener noreferrer">${escaparHtmlPlano(ubicacion)}</a>`
                    : `<p class="texto-vista-rapida-itinerario">${escaparHtmlPlano(ubicacion)}</p>`)
                : `<p class="texto-vista-rapida-itinerario vacio">No hay una ubicación guardada para este restaurante.</p>`;

            abrirModalVistaRapidaItinerario({
                titulo: `📍 ${titulo}`,
                subtitulo: 'Ubicación guardada en el formulario',
                contenido
            });
        };

        window.verImagenAventura = function(idPais, idItem) {
            const destino = destinosSonados[idPais];
            const item = Array.isArray(destino?.itinerario) ? destino.itinerario.find((actual) => String(actual?.id) === String(idItem)) : null;
            if (!item) return;
            const miniatura = String(item.miniatura || '').trim();
            const titulo = item.lugar || 'Aventura';
            const contenido = miniatura
                ? `<img class="imagen-vista-rapida-itinerario" src="${miniatura}" alt="Imagen de ${escaparHtmlPlano(titulo)}" loading="lazy">`
                : `<p class="texto-vista-rapida-itinerario vacio">No hay una imagen guardada para esta aventura.</p>`;

            abrirModalVistaRapidaItinerario({
                titulo: `📷 ${titulo}`,
                subtitulo: 'Imagen cargada por URL en el formulario',
                contenido
            });
        };

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
                const { fechaFin, horaFin } = obtenerRangoTemporalItem(destino, item);
                const diaFin = diaPorFecha.get(fechaFin) || diaInicio;

                if (item?.tipo === 'viaje') {
                    agregarItemEnDia(diaInicio, item, indiceCreacion, {
                        _horaOrden: item?.partida || item?.llegada || '',
                        _esSalidaViajeVirtual: true
                    });
                    agregarItemEnDia(diaFin, item, indiceCreacion, {
                        _horaOrden: horaFin || item?.llegada || item?.partida || '',
                        _esLlegadaViajeVirtual: true
                    });
                    return;
                }

                if (item?.tipo === 'hospedaje') {
                    agregarItemEnDia(diaInicio, item, indiceCreacion, {
                        _horaOrden: item?.llegada || '',
                        _esCheckinHospedajeVirtual: true
                    });
                    agregarItemEnDia(diaFin, item, indiceCreacion, {
                        _horaOrden: horaFin || item?.partida || '',
                        _esCheckoutVirtual: true
                    });
                    return;
                }

                agregarItemEnDia(diaInicio, item, indiceCreacion, { _horaOrden: item?.llegada || item?.partida || '' });
            });

            const columnas = Array.from(grupos.values())
                .sort((a, b) => (a.numero || 0) - (b.numero || 0))
                .map(dia => {
                    const itemsDia = Array.isArray(dia.items) ? dia.items : [];
                    const nombreDia = (dia.nombre || `Día ${dia.numero || 1}`).trim();
                    const fechaDia = formatearFechaCortaItinerario(dia.fecha) || '__/__/____';
                    itemsDia.sort((a, b) => {
                        const minutosA = obtenerMinutosHorario(a);
                        const minutosB = obtenerMinutosHorario(b);
                        if (minutosA !== minutosB) return minutosA - minutosB;
                        return a._ordenCreacion - b._ordenCreacion;
                    });

                    const tarjetas = itemsDia.map(item => {
                        const meta = obtenerMetaItinerario(item, destino);
                        const botonAccionRapida = item.tipo === 'restaurante'
                            ? `<button class="btn-accion-rapida-calendario" onclick="verUbicacionRestaurante('${idPais}', '${item.id}')" title="Ver ubicación">📍</button>`
                            : item.tipo === 'aventura'
                                ? `<button class="btn-accion-rapida-calendario" onclick="verImagenAventura('${idPais}', '${item.id}')" title="Ver imagen">🖼️</button>`
                                : '';
                        const resumen = item.tipo === 'restaurante'
                            ? [
                                `${normalizarHoraItinerario(item.llegada) || 'Sin horario'} - ${normalizarHoraItinerario(item.partida) || 'Sin horario'}`,
                                `${item.plato || 'Comida'}`,
                                `Precio: ${formatearMonedaItinerario(item.costo ?? item.precio ?? 0)}`
                            ].map(linea => `<p>${linea}</p>`).join('')
                            : obtenerResumenTarjetaItinerario(destino, item)
                                .map(linea => `<p>${linea}</p>`)
                                .join('');
                        return `
                            <article class="tarjeta-calendario-itinerario ${item.tipo || ''}" data-itinerario-item-id="${item.id}">
                                <div class="tarjeta-calendario-header">
                                    <h4><i data-lucide="${meta.icono}"></i> ${meta.titulo}</h4>
                                    ${botonAccionRapida}
                                </div>
                                <div class="item-detalles">${resumen}</div>
                            </article>
                        `;
                    }).join('');

                    return `
                        <section class="columna-dia-itinerario">
                            <header class="cabecera-columna-dia-itinerario">
                                <div class="cabecera-dia-contenido">
                                    <div class="cabecera-dia-principal">
                                        <span class="cabecera-dia-titulo-editable">${nombreDia}</span>
                                        <button class="btn-editar-dia-calendario" onclick="editarNombreDia('${idPais}', '${dia.id}')" title="Editar nombre del día">
                                            <i data-lucide="pencil"></i>
                                        </button>
                                    </div>
                                    <span class="cabecera-dia-subtitulo">${fechaDia} - Día ${dia.numero || 1}</span>
                                </div>
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
            if (btn) btn.classList.add('activo');

            const previo = document.getElementById('modal-confirmacion-itinerario');
            if (previo) previo.remove();

            const modal = document.createElement('div');
            modal.className = 'modal-confirmacion-itinerario';
            modal.id = 'modal-confirmacion-itinerario';
            modal.innerHTML = `
                <div class="modal-confirmacion-itinerario-contenido" role="dialog" aria-modal="true" aria-label="Precaución al eliminar itinerario">
                    <h3>⚠️ Precaución</h3>
                    <p>¿Está seguro que desea eliminar el itinerario completo?</p>
                    <div class="modal-confirmacion-itinerario-botones">
                        <button type="button" class="btn-modal-metal cancelar" id="btn-cancelar-eliminacion-itinerario">Cancelar</button>
                        <button type="button" class="btn-modal-metal eliminar" id="btn-confirmar-eliminacion-itinerario">Eliminar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const cerrarModal = () => {
                modal.remove();
                if (btn) btn.classList.remove('activo');
            };

            document.getElementById('btn-cancelar-eliminacion-itinerario')?.addEventListener('click', cerrarModal);
            document.getElementById('btn-confirmar-eliminacion-itinerario')?.addEventListener('click', () => {
                delete destinosSonados[idPais];
                d3.selectAll('.pais').classed('sonado', function(d) { return destinosSonados[d.id] ? true : false; });
                cerrarModal();
                renderizarPantallaSonados();
            });
            modal.addEventListener('click', (event) => {
                if (event.target === modal) cerrarModal();
            });
        };

        window.mostrarFormularioItinerario = function(tipo, btn, config = {}) {
            document.querySelectorAll('.btn-tipo-item').forEach(b => b.classList.remove('seleccionado'));
            if (btn) btn.classList.add('seleccionado');

            const contenedor = document.getElementById('contenedor-formularios');
            const itemExistente = config.item || null;
            const esEdicion = Boolean(itemExistente);
            const idPais = document.querySelector('.linea-tiempo').id.replace('linea-tiempo-', '');
            const destino = destinosSonados[idPais];
            const fechaActual = itemExistente?.tipo === 'hospedaje'
                ? obtenerFechaLlegadaHospedaje(itemExistente)
                : (itemExistente?.fechaActividad || '');
            let formHTML = `<div class="formulario-itinerario activo" id="form-${tipo}">`;

            if (tipo === 'viaje') {
                const paisesMapa = d3.selectAll('.pais').data();
                const paisesSelect = paisesMapa
                    .map(d => ({ id: d.id, nombre: d.properties.name }))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map(p => `<option value="${p.id}" ${itemExistente?.destinoId === p.id ? 'selected' : ''}>${p.nombre}</option>` )
                    .join('');
                const duracion = normalizarDuracionViaje(itemExistente?.duracion || `${itemExistente?.horas || 0}:${String(itemExistente?.minutos || '00').padStart(2, '0')}`);
                const costo = formatearMilesConPuntos(itemExistente?.costo || '');
                const fechaPartida = normalizarFechaItinerario(itemExistente?.fechaPartida || itemExistente?.fechaActividad || '');
                const fechaLlegada = normalizarFechaItinerario(itemExistente?.fechaLlegada || itemExistente?.fechaActividad || '');

                const opcionesDuracion = Array.from({ length: 49 }, (_, i) => {
                    const totalMinutos = (i + 1) * 30;
                    const horasDuracion = Math.floor(totalMinutos / 60);
                    const minutosDuracion = totalMinutos % 60;
                    const valor = `${horasDuracion}:${String(minutosDuracion).padStart(2, '0')}`;
                    return `<option value="${valor}" ${duracion === valor ? 'selected' : ''}>${valor}</option>`;
                }).join('');

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
                    <div class="campo-form"><label>Duración estimada</label>
                        <select id="input-viaje-duracion">${opcionesDuracion}</select>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Partida - Fecha</label><input type="date" id="input-viaje-fecha-partida" value="${fechaPartida}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida - Hora</label><input type="time" id="input-viaje-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada - Fecha</label><input type="date" id="input-viaje-fecha-llegada" value="${fechaLlegada}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Llegada - Hora</label><input type="time" id="input-viaje-llegada" value="${itemExistente?.llegada || ''}"></div>
                    </div>
                    <div class="campo-form"><label>Costo Pasaje ($)</label><input type="text" inputmode="numeric" id="input-viaje-costo" placeholder="Ej. 150.000" value="${costo}"></div>
                `;
            } else if (tipo === 'hospedaje') {
                const fechaCheckoutExistente = itemExistente?.fechaCheckout || obtenerFechaCheckoutHospedaje(itemExistente, fechaActual);
                const fechaLlegadaExistente = obtenerFechaLlegadaHospedaje(itemExistente);
                const precioPorNocheExistente = itemExistente?.precioPorNoche || ((Number(itemExistente?.noches) || 0) > 0 ? Math.round((Number(itemExistente?.costo) || 0) / (Number(itemExistente?.noches) || 1)) : '');
                const costoTotalExistente = calcularPrecioTotalHospedaje(itemExistente?.noches || 0, precioPorNocheExistente || 0);
                formHTML += `
                    <div class="campo-form"><label>Nombre del Hotel</label><input type="text" id="input-hospedaje-nombre" placeholder="Ej. Hotel Copacabana" value="${itemExistente?.hotel || ''}"></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Noches</label><input type="number" id="input-hospedaje-noches" placeholder="Ej. 5" value="${itemExistente?.noches || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Precio por noche ($)</label><input type="number" id="input-hospedaje-precio-noche" placeholder="Ej. 16000" value="${precioPorNocheExistente || ''}"></div>
                    </div>
                    <div class="campo-form"><label>Precio Total ($)</label><p id="input-hospedaje-costo-total" class="texto-calculado-itinerario">${formatearMilesConPuntos(costoTotalExistente || '0') || '0'}</p></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada (fecha)</label><input type="date" id="input-hospedaje-llegada-fecha" value="${fechaLlegadaExistente || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Check In (hora)</label><input type="time" id="input-hospedaje-checkin-hora" value="${itemExistente?.partida || ''}"></div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Check Out (fecha)</label><input type="date" id="input-hospedaje-checkout" value="${fechaCheckoutExistente || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Check Out (hora)</label><input type="time" id="input-hospedaje-checkout-hora" value="${itemExistente?.llegada || ''}"></div>
                    </div>
                `;
            } else if (tipo === 'aventura') {
                const miniaturaExistente = itemExistente?.miniatura || '';
                const mostrarMiniaturaBloqueada = Boolean(miniaturaExistente);
                formHTML += `
                    <div class="campo-form"><label>Lugar a visitar</label><input type="text" id="input-aventura-lugar" placeholder="Ej. Cristo Redentor" value="${itemExistente?.lugar || ''}"></div>
                    <details id="detalle-aventura-miniatura" class="campo-ubicacion-desplegable" ${mostrarMiniaturaBloqueada ? '' : 'open'}>
                        <summary>Portada (URL)</summary>
                        ${mostrarMiniaturaBloqueada ? `
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                                <img src="${miniaturaExistente}" alt="Miniatura actual de ${itemExistente?.lugar || 'aventura'}" class="miniatura-aventura">
                            </div>
                        ` : ''}
                        <div class="campo-form">
                            <label>Enlace de portada</label>
                            <input type="url" id="input-aventura-miniatura" placeholder="Ej. https://.../cristo-redentor.jpg" value="${miniaturaExistente}" ${mostrarMiniaturaBloqueada ? 'readonly' : ''}>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button type="button" id="btn-guardar-url-aventura" class="btn-mini-accion-itinerario" onclick="guardarUrlAventura()">Guardar URL</button>
                            ${mostrarMiniaturaBloqueada ? `<button type="button" id="btn-editar-url-aventura" class="btn-mini-accion-itinerario" onclick="habilitarEdicionUrlAventura()">Editar URL</button>` : ''}
                        </div>
                    </details>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Precio por persona ($)</label><input type="text" inputmode="numeric" id="input-aventura-costo" placeholder="0" value="${formatearMilesConPuntos(itemExistente?.costo || '')}"></div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada</label><input type="time" id="input-aventura-llegada" value="${itemExistente?.llegada || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida</label><input type="time" id="input-aventura-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                `;
            } else if (tipo === 'restaurante') {
                formHTML += `
                    <div class="campo-form"><label>Restaurante</label><input type="text" id="input-rest-restaurante" placeholder="Ej. Fogo de Chão" value="${itemExistente?.restaurante || ''}"></div>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 2;"><label>Plato</label><input type="text" id="input-rest-plato" placeholder="Ej. Feijoada" value="${itemExistente?.plato || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Costo por persona ($)</label><input type="text" inputmode="numeric" id="input-rest-costo" placeholder="Ej. 25.000" value="${formatearMilesConPuntos(itemExistente?.costo ?? itemExistente?.precio ?? '')}"></div>
                    </div>
                    <details class="campo-ubicacion-desplegable" ${itemExistente?.ubicacion ? 'open' : ''}>
                        <summary>Ubicación</summary>
                        <div class="campo-form">
                            <label>Enlace o texto (queda oculto hasta abrir)</label>
                            <textarea id="input-rest-ubicacion" rows="3" placeholder="Pega un link de mapas, dirección o referencia">${itemExistente?.ubicacion || ''}</textarea>
                        </div>
                    </details>
                    <div style="display: flex; gap: 10px;">
                        <div class="campo-form" style="flex: 1;"><label>Llegada</label><input type="time" id="input-rest-llegada" value="${itemExistente?.llegada || ''}"></div>
                        <div class="campo-form" style="flex: 1;"><label>Partida</label><input type="time" id="input-rest-partida" value="${itemExistente?.partida || ''}"></div>
                    </div>
                `;
            }

            if (tipo !== 'viaje' && tipo !== 'hospedaje') {
                formHTML += `
                    <div class="campo-form"><label>Fecha de actividad</label>
                        <input type="date" id="input-item-fecha" value="${fechaActual}">
                    </div>
                `;
            }
            if (esEdicion) {
                formHTML += `<div style="display:flex; gap:10px;"><button class="btn-guardar-item" onclick="actualizarItemItinerario('${idPais}', ${itemExistente.id}, '${tipo}')">Guardar cambios ✨</button><button class="btn-cancelar-item" onclick="cancelarFormularioItinerario()">Cancelar</button></div></div>`;
            } else {
                formHTML += `<div style="display:flex; gap:10px;"><button class="btn-guardar-item" onclick="guardarItemItinerario('${idPais}', '${tipo}')">Añadir al Itinerario ✨</button><button class="btn-cancelar-item" onclick="cancelarFormularioItinerario()">Cancelar</button></div></div>`;
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
            if (tipo === 'viaje') {
                const inputCosto = document.getElementById('input-viaje-costo');
                if (inputCosto) {
                    inputCosto.addEventListener('input', (event) => {
                        event.target.value = formatearMilesConPuntos(event.target.value);
                    });
                }
            }
            if (tipo === 'aventura') {
                const inputCostoAventura = document.getElementById('input-aventura-costo');
                if (inputCostoAventura) {
                    inputCostoAventura.addEventListener('input', (event) => {
                        event.target.value = formatearMilesConPuntos(event.target.value);
                    });
                }
            }
            if (tipo === 'restaurante') {
                const inputCostoRest = document.getElementById('input-rest-costo');
                if (inputCostoRest) {
                    inputCostoRest.addEventListener('input', (event) => {
                        event.target.value = formatearMilesConPuntos(event.target.value);
                    });
                }
            }
            if (tipo === 'hospedaje') {
                const inputNoches = document.getElementById('input-hospedaje-noches');
                const inputPrecioNoche = document.getElementById('input-hospedaje-precio-noche');
                const precioTotalTexto = document.getElementById('input-hospedaje-costo-total');
                const actualizarPrecioTotal = () => {
                    if (!precioTotalTexto) return;
                    const total = calcularPrecioTotalHospedaje(inputNoches?.value || 0, inputPrecioNoche?.value || 0);
                    precioTotalTexto.textContent = formatearMilesConPuntos(total || '0') || '0';
                };
                inputNoches?.addEventListener('input', actualizarPrecioTotal);
                inputPrecioNoche?.addEventListener('input', actualizarPrecioTotal);
                actualizarPrecioTotal();
            }
        };

        window.habilitarEdicionUrlAventura = function() {
            const inputUrl = document.getElementById('input-aventura-miniatura');
            const detalle = document.getElementById('detalle-aventura-miniatura');
            if (!inputUrl) return;
            if (detalle) detalle.open = true;
            inputUrl.style.display = '';
            inputUrl.readOnly = false;
            inputUrl.focus();
        };

        window.guardarUrlAventura = function() {
            const detalle = document.getElementById('detalle-aventura-miniatura');
            const inputUrl = document.getElementById('input-aventura-miniatura');
            if (!inputUrl || !detalle) return;
            inputUrl.value = inputUrl.value.trim();
            inputUrl.readOnly = true;
            detalle.open = false;
        };

        window.guardarItemItinerario = function(idPais, tipo) {
            let nuevoItem = { tipo: tipo, id: Date.now() };
            const dataPais = destinosSonados[idPais];
            normalizarDestinosSonados();
            if (!dataPais.destinoFinal) dataPais.destinoFinal = dataPais.nombre;
            if (!dataPais.escalas) dataPais.escalas = [];
            if (!dataPais.escalasCiudades) dataPais.escalasCiudades = [];
            nuevoItem.fechaActividad = tipo === 'viaje'
                ? (document.getElementById('input-viaje-fecha-partida')?.value || '')
                : (tipo === 'hospedaje'
                    ? (document.getElementById('input-hospedaje-llegada-fecha')?.value || '')
                    : (document.getElementById('input-item-fecha')?.value || ''));
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
                nuevoItem.duracion = normalizarDuracionViaje(document.getElementById('input-viaje-duracion').value || '0:30');
                nuevoItem.costo = limpiarNumeroMoneda(document.getElementById('input-viaje-costo').value || '0') || '0';
                nuevoItem.fechaPartida = document.getElementById('input-viaje-fecha-partida').value || '';
                nuevoItem.fechaLlegada = document.getElementById('input-viaje-fecha-llegada').value || nuevoItem.fechaPartida;
                nuevoItem.partida = document.getElementById('input-viaje-partida').value;
                nuevoItem.llegada = document.getElementById('input-viaje-llegada').value;
                nuevoItem.fechaActividad = nuevoItem.fechaPartida || nuevoItem.fechaActividad;
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
                nuevoItem.precioPorNoche = document.getElementById('input-hospedaje-precio-noche').value || '0';
                nuevoItem.costo = calcularPrecioTotalHospedaje(nuevoItem.noches, nuevoItem.precioPorNoche);
                nuevoItem.partida = document.getElementById('input-hospedaje-checkin-hora').value;
                nuevoItem.llegada = document.getElementById('input-hospedaje-checkout-hora').value;
                nuevoItem.fechaLlegada = document.getElementById('input-hospedaje-llegada-fecha')?.value || '';
                nuevoItem.fechaActividad = nuevoItem.fechaLlegada;
                const fechaCheckoutIngresada = document.getElementById('input-hospedaje-checkout')?.value || '';
                nuevoItem.fechaCheckout = obtenerFechaCheckoutHospedaje({ ...nuevoItem, fechaCheckout: fechaCheckoutIngresada }, nuevoItem.fechaLlegada);
            } else if (tipo === 'aventura') {
                nuevoItem.lugar = document.getElementById('input-aventura-lugar').value || 'Aventura';
                nuevoItem.miniatura = document.getElementById('input-aventura-miniatura').value.trim();
                nuevoItem.costo = limpiarNumeroMoneda(document.getElementById('input-aventura-costo').value || '0') || '0';
                nuevoItem.llegada = document.getElementById('input-aventura-llegada').value;
                nuevoItem.partida = document.getElementById('input-aventura-partida').value;
            } else if (tipo === 'restaurante') {
                nuevoItem.restaurante = document.getElementById('input-rest-restaurante').value || 'Restaurante';
                nuevoItem.plato = document.getElementById('input-rest-plato').value || 'No especificado';
                nuevoItem.costo = limpiarNumeroMoneda(document.getElementById('input-rest-costo').value || '0') || '0';
                nuevoItem.ubicacion = document.getElementById('input-rest-ubicacion')?.value?.trim() || '';
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
            itemActualizado.fechaActividad = tipo === 'viaje'
                ? (document.getElementById('input-viaje-fecha-partida')?.value || itemActualizado.fechaActividad || '')
                : (tipo === 'hospedaje'
                    ? (document.getElementById('input-hospedaje-llegada-fecha')?.value || itemActualizado.fechaActividad || '')
                    : (document.getElementById('input-item-fecha')?.value || ''));

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
                itemActualizado.duracion = normalizarDuracionViaje(document.getElementById('input-viaje-duracion').value || '0:30');
                itemActualizado.costo = limpiarNumeroMoneda(document.getElementById('input-viaje-costo').value || '0') || '0';
                itemActualizado.fechaPartida = document.getElementById('input-viaje-fecha-partida').value || '';
                itemActualizado.fechaLlegada = document.getElementById('input-viaje-fecha-llegada').value || itemActualizado.fechaPartida;
                itemActualizado.partida = document.getElementById('input-viaje-partida').value;
                itemActualizado.llegada = document.getElementById('input-viaje-llegada').value;
                itemActualizado.fechaActividad = itemActualizado.fechaPartida || itemActualizado.fechaActividad;
            } else if (tipo === 'hospedaje') {
                itemActualizado.hotel = document.getElementById('input-hospedaje-nombre').value || 'Alojamiento';
                itemActualizado.noches = document.getElementById('input-hospedaje-noches').value || '1';
                itemActualizado.precioPorNoche = document.getElementById('input-hospedaje-precio-noche').value || '0';
                itemActualizado.costo = calcularPrecioTotalHospedaje(itemActualizado.noches, itemActualizado.precioPorNoche);
                itemActualizado.partida = document.getElementById('input-hospedaje-checkin-hora').value;
                itemActualizado.llegada = document.getElementById('input-hospedaje-checkout-hora').value;
                itemActualizado.fechaLlegada = document.getElementById('input-hospedaje-llegada-fecha')?.value || '';
                itemActualizado.fechaActividad = itemActualizado.fechaLlegada;
                const fechaCheckoutIngresada = document.getElementById('input-hospedaje-checkout')?.value || '';
                itemActualizado.fechaCheckout = obtenerFechaCheckoutHospedaje({ ...itemActualizado, fechaCheckout: fechaCheckoutIngresada }, itemActualizado.fechaLlegada);
            } else if (tipo === 'aventura') {
                itemActualizado.lugar = document.getElementById('input-aventura-lugar').value || 'Aventura';
                itemActualizado.miniatura = document.getElementById('input-aventura-miniatura').value.trim();
                itemActualizado.costo = limpiarNumeroMoneda(document.getElementById('input-aventura-costo').value || '0') || '0';
                itemActualizado.llegada = document.getElementById('input-aventura-llegada').value;
                itemActualizado.partida = document.getElementById('input-aventura-partida').value;
            } else if (tipo === 'restaurante') {
                itemActualizado.restaurante = document.getElementById('input-rest-restaurante').value || 'Restaurante';
                itemActualizado.plato = document.getElementById('input-rest-plato').value || 'No especificado';
                itemActualizado.costo = limpiarNumeroMoneda(document.getElementById('input-rest-costo').value || '0') || '0';
                itemActualizado.ubicacion = document.getElementById('input-rest-ubicacion')?.value?.trim() || '';
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
                <button class="btn-editar-item btn-icono-metal subir" onclick="moverItemItinerario('${idPais}', ${item.id}, 'arriba')" ${deshabilitarSubir ? 'disabled' : ''} title="Subir">
                    <i data-lucide="arrow-up"></i>
                </button>
                <button class="btn-editar-item btn-icono-metal bajar" onclick="moverItemItinerario('${idPais}', ${item.id}, 'abajo')" ${deshabilitarBajar ? 'disabled' : ''} title="Bajar">
                    <i data-lucide="arrow-down"></i>
                </button>
            `;

            items.forEach((item, index) => {
                let icono = 'circle'; let titulo = '';
                if (item.tipo === 'viaje') { icono = 'bus'; titulo = `${item.medio || 'Micro'}`.toUpperCase(); }
                else if (item.tipo === 'hospedaje') { icono = 'hotel'; titulo = (item.hotel || 'Hospedaje').toUpperCase(); }
                else if (item.tipo === 'aventura') { icono = 'mountain'; titulo = (item.lugar || 'Aventura').toUpperCase(); }
                else if (item.tipo === 'restaurante') { icono = 'utensils'; titulo = (item.restaurante || 'Restaurante').toUpperCase(); }
                const detalles = obtenerResumenTarjetaItinerario(destino, item)
                    .map(linea => `<p>${linea}</p>`)
                    .join('');
                const botonImagenAventura = item.tipo === 'aventura'
                    ? `<button class="btn-accion-rapida-calendario" onclick="verImagenAventura('${idPais}', '${item.id}')" title="Ver imagen">🖼️</button>`
                    : '';
                const deshabilitarSubir = index === 0;
                const deshabilitarBajar = index === (items.length - 1);
                const botonUbicacion = item.tipo === 'restaurante'
                    ? `<button class="btn-editar-item btn-icono-metal ubicacion" onclick="mostrarNotaUbicacionRestaurante('${idPais}', ${item.id})" title="Ver ubicación">📍</button>`
                    : '';
                timeline.innerHTML += `
                    <div class="item-timeline ${item.tipo}" data-itinerario-item-id="${item.id}"><div class="punto-timeline"></div>
                        <div class="item-header"><h4 class="item-titulo"><i data-lucide="${icono}"></i> ${titulo}</h4>
                        <div class="item-header-actions">${botonImagenAventura}${botonUbicacion}${dibujarBotonesOrden(item, deshabilitarSubir, deshabilitarBajar)}<button class="btn-editar-item btn-icono-metal editar" onclick="editarItemItinerario('${idPais}', ${item.id})"><i data-lucide="pencil"></i></button><button class="btn-eliminar-item btn-icono-metal eliminar" onclick="eliminarItemItinerario('${idPais}', ${item.id})"><i data-lucide="trash-2"></i></button></div></div>
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
                                    <h4 class="item-titulo"><i data-lucide="${item.tipo === 'viaje' ? 'bus' : item.tipo === 'hospedaje' ? 'hotel' : item.tipo === 'aventura' ? 'mountain' : 'utensils'}"></i> ${item.tipo === 'viaje' ? `${item.medio || 'Micro'}`.toUpperCase() : (item.tipo === 'hospedaje' ? (item.hotel || 'Hospedaje').toUpperCase() : (item.tipo === 'aventura' ? (item.lugar || 'Aventura').toUpperCase() : (item.restaurante || 'Restaurante')))}</h4>
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

        window.mostrarNotaUbicacionRestaurante = function(idPais, idItem) {
            const destino = destinosSonados[idPais];
            if (!destino || !Array.isArray(destino.itinerario)) return;
            const item = destino.itinerario.find(i => Number(i.id) === Number(idItem));
            if (!item || item.tipo !== 'restaurante') return;
            window.verUbicacionRestaurante(idPais, idItem);
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
        window.cancelarEdicionPortadaItinerario = function(idPais) {
            estadoEdicionPortadaItinerario[idPais] = false;
            abrirPlanificador(idPais);
        };
        window.cancelarFormularioItinerario = function() {
            document.getElementById('contenedor-formularios').innerHTML = '';
            document.querySelectorAll('.btn-tipo-item').forEach(b => b.classList.remove('seleccionado'));
        };

        function detenerReproductorRevivir() {
            const video = document.getElementById('revivir-player-video');
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.load();
            }
        }

        function obtenerTipoMediaRevivir(file = {}) {
            if (String(file.type || '').startsWith('video/')) return 'video';
            if (String(file.type || '').startsWith('image/')) return 'imagen';
            return null;
        }

        function obtenerIconoMediaRevivir(tipo) {
            if (tipo === 'video') return 'film';
            return 'image';
        }

        function seleccionarMediaRevivir(index) {
            const media = bibliotecaRevivir[index];
            if (!media) return;

            indiceMediaRevivirActual = index;
            const img = document.getElementById('revivir-player-image');
            const video = document.getElementById('revivir-player-video');
            const titulo = document.getElementById('revivir-player-titulo');
            const meta = document.getElementById('revivir-player-meta');

            if (!img || !video || !titulo || !meta) return;

            titulo.textContent = media.nombre;
            const textoTamano = media.size ? ` · ${(media.size / 1024 / 1024).toFixed(2)} MB` : '';
            meta.textContent = `${media.tipo === 'video' ? 'Video' : 'Imagen'}${textoTamano}`;

            if (media.tipo === 'video') {
                img.hidden = true;
                img.removeAttribute('src');
                video.hidden = false;
                video.src = media.url;
                video.load();
            } else {
                detenerReproductorRevivir();
                video.hidden = true;
                img.hidden = false;
                img.src = media.url;
                img.alt = media.nombre;
            }

            document.querySelectorAll('.revivir-item').forEach((item, idx) => {
                item.classList.toggle('activo', idx === index);
            });
        }

        function renderizarListaRevivir() {
            const lista = document.getElementById('revivir-lista');
            if (!lista) return;

            if (!bibliotecaRevivir.length) {
                lista.innerHTML = `<p class="revivir-vacio">Cargá una carpeta de memorias para empezar a revivir momentos ✨</p>`;
                return;
            }

            lista.innerHTML = bibliotecaRevivir.map((item, index) => `
                <button type="button" class="revivir-item ${index === indiceMediaRevivirActual ? 'activo' : ''}" onclick="seleccionarMediaRevivir(${index})">
                    <i data-lucide="${obtenerIconoMediaRevivir(item.tipo)}"></i>
                    <span class="revivir-item-texto">${item.nombre}</span>
                </button>
            `).join('');
            lucide.createIcons();
        }

        function inferirTipoArchivoDriveRevivir(archivo = {}) {
            const mime = String(archivo?.mimeType || '').toLowerCase();
            const nombre = String(archivo?.name || '').toLowerCase();
            if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/.test(nombre)) return 'video';
            if (mime.startsWith('image/') || /\.(avif|gif|jpe?g|png|svg|webp)$/.test(nombre)) return 'imagen';
            return null;
        }

        function obtenerCarpetasMemoriaDisponiblesRevivir() {
            const carpetas = [];

            Object.entries(paisesVisitados || {}).forEach(([idPais, pais]) => {
                const nombrePais = pais?.nombre || idPais;
                (pais?.albumes || []).forEach((album) => {
                    const url = resolverUrlDriveAlbum(album);
                    if (!url || !/drive\.google\.com/i.test(url)) return;
                    if (!/\/folders\//i.test(url) && !/embeddedfolderview/i.test(url)) return;
                    const nombreCarpeta = album?.nombre || 'Carpeta compartida';
                    carpetas.push({
                        etiqueta: `${nombrePais} · ${nombreCarpeta}`,
                        nombre: nombreCarpeta,
                        url
                    });
                });
            });

            Object.entries(provinciasVisitadas || {}).forEach(([idPais, provincias]) => {
                const nombrePais = paisesVisitados?.[idPais]?.nombre || idPais;
                Object.values(provincias || {}).forEach((provincia) => {
                    const nombreCiudad = provincia?.nombre || 'Ciudad';
                    (provincia?.albumes || []).forEach((album) => {
                        const url = resolverUrlDriveAlbum(album);
                        if (!url || !/drive\.google\.com/i.test(url)) return;
                        if (!/\/folders\//i.test(url) && !/embeddedfolderview/i.test(url)) return;
                        const nombreCarpeta = album?.nombre || 'Carpeta compartida';
                        carpetas.push({
                            etiqueta: `${nombrePais} · ${nombreCiudad} · ${nombreCarpeta}`,
                            nombre: nombreCarpeta,
                            url
                        });
                    });
                });
            });

            return carpetas;
        }

        window.cargarCarpetaMemoriaRevivir = async function() {
            const carpetas = obtenerCarpetasMemoriaDisponiblesRevivir();
            if (!carpetas.length) {
                alert('No encontramos carpetas de memorias de ciudad para cargar.');
                return;
            }

            const listado = carpetas
                .slice(0, 25)
                .map((carpeta, idx) => `${idx + 1}. ${carpeta.etiqueta}`)
                .join('\n');
            const seleccion = window.prompt(`Elegí una carpeta para revivir:\n\n${listado}\n\nEscribí el número de opción:`);
            if (!seleccion) return;

            const indice = Number.parseInt(seleccion, 10) - 1;
            if (!Number.isInteger(indice) || indice < 0 || indice >= carpetas.length) {
                alert('La opción ingresada no es válida.');
                return;
            }

            const carpeta = carpetas[indice];
            const resultado = await obtenerArchivosPublicosDeCarpetaDrive(carpeta.url);
            const archivos = resultado?.archivos || [];

            const nuevos = archivos
                .map((archivo, index) => {
                    const tipo = inferirTipoArchivoDriveRevivir(archivo);
                    if (!tipo) return null;
                    const exportacion = tipo === 'video' ? 'download' : 'view';
                    return {
                        tipo,
                        nombre: archivo?.name || `${tipo === 'video' ? 'Video' : 'Foto'} ${index + 1}`,
                        size: 0,
                        url: `https://drive.google.com/uc?export=${exportacion}&id=${archivo.id}`
                    };
                })
                .filter(Boolean);

            if (!nuevos.length) {
                alert('No se encontraron fotos o videos en esa carpeta.');
                return;
            }

            bibliotecaRevivir.forEach((item) => {
                if (String(item.url || '').startsWith('blob:')) URL.revokeObjectURL(item.url);
            });
            bibliotecaRevivir = nuevos;
            indiceMediaRevivirActual = 0;
            renderizarListaRevivir();
            seleccionarMediaRevivir(0);
        };

        window.seleccionarMediaRevivir = seleccionarMediaRevivir;

        window.cargarMediaRevivir = function(event) {
            const archivos = Array.from(event?.target?.files || []);
            if (!archivos.length) return;

            const nuevos = archivos
                .map((file) => ({
                    tipo: obtenerTipoMediaRevivir(file),
                    nombre: file.name,
                    size: file.size,
                    url: URL.createObjectURL(file)
                }))
                .filter((item) => item.tipo);

            if (!nuevos.length) return;

            bibliotecaRevivir.push(...nuevos);
            if (indiceMediaRevivirActual === -1) {
                indiceMediaRevivirActual = 0;
            }
            renderizarListaRevivir();
            seleccionarMediaRevivir(indiceMediaRevivirActual);
            event.target.value = '';
        };

        window.limpiarMediaRevivir = function() {
            bibliotecaRevivir.forEach((item) => URL.revokeObjectURL(item.url));
            bibliotecaRevivir = [];
            indiceMediaRevivirActual = -1;
            detenerReproductorRevivir();

            const img = document.getElementById('revivir-player-image');
            const video = document.getElementById('revivir-player-video');
            const titulo = document.getElementById('revivir-player-titulo');
            const meta = document.getElementById('revivir-player-meta');
            if (img) {
                img.hidden = true;
                img.removeAttribute('src');
            }
            if (video) {
                video.hidden = true;
            }
            if (titulo) titulo.textContent = 'Tu momento especial';
            if (meta) meta.textContent = 'Seleccioná una foto o video para verlo acá.';
            renderizarListaRevivir();
        };

        function renderizarPantallaRevivir() {
            const contenedor = document.getElementById('vista-revivir');
            if (!contenedor) return;

            contenedor.innerHTML = `
                <div class="encabezado-seccion encabezado-revivir" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                    <h2 class="titulo-revivir"><i data-lucide="clapperboard"></i> Revivir</h2>
                    <div class="revivir-acciones">
                        <label class="btn-nueva-aventura revivir-upload-btn" onclick="cargarCarpetaMemoriaRevivir()">
                            <i data-lucide="folder-open"></i> Cargar carpeta
                        </label>
                        <button type="button" class="btn-nueva-aventura revivir-limpiar-btn" onclick="limpiarMediaRevivir()">
                            <i data-lucide="trash-2"></i> Limpiar
                        </button>
                    </div>
                </div>

                <div class="revivir-layout">
                    <aside id="revivir-lista" class="revivir-lista"></aside>
                    <section class="revivir-player">
                        <div class="revivir-player-head">
                            <h3 id="revivir-player-titulo">Tu momento especial</h3>
                            <p id="revivir-player-meta">Seleccioná una foto o video para verlo acá.</p>
                        </div>
                        <div class="revivir-player-media">
                            <img id="revivir-player-image" hidden alt="Vista previa en Revivir">
                            <video id="revivir-player-video" hidden controls playsinline></video>
                        </div>
                    </section>
                </div>
            `;

            renderizarListaRevivir();
            if (indiceMediaRevivirActual >= 0) {
                seleccionarMediaRevivir(indiceMediaRevivirActual);
            }
            lucide.createIcons();
        }

        document.addEventListener("DOMContentLoaded", async () => {
            iniciarSincronizacionFirebase();
        });
    
