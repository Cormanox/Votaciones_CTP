/**
 * Sistema de Votaciones Estudiantiles - Escrutinio Real-Time
 * Firebase Cloud Firestore (SDK v10+ Modular CDN)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    getDocs, 
    collection, 
    query, 
    where, 
    runTransaction,
    getCountFromServer,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getAuth, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// =========================================================================
// CONFIGURACIÓN E INTERRUPTOR DE SIMULACIÓN (DEMO MODE)
// =========================================================================
const USAR_DEMO = false;

// Credenciales oficiales de tu proyecto en la consola de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCGsoZQVSRnI2ZFomFVLW8V3moFkMvlOmA",
    authDomain: "votaciones-cole.firebaseapp.com",
    projectId: "votaciones-cole",
    storageBucket: "votaciones-cole.firebasestorage.app",
    messagingSenderId: "761020745961",
    appId: "1:761020745961:web:f38ba1d026bdcde9354878"
};

// Inicialización de Firebase
let db = null;
let auth = null;
let firebaseInicializado = false;
let resultsChart = null; // Variable global para la referencia al gráfico de Chart.js

function inicializarFirebase() {
    if (firebaseInicializado) return;
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        signInAnonymously(auth)
            .then(() => {
                console.log("🔥 Conexión segura establecida con la mesa de escrutinio.");
                actualizarEstadoConexion(true);
            })
            .catch((error) => {
                console.error("❌ Error en autenticación anónima:", error);
                actualizarEstadoConexion(false, "Error de autenticación");
            });
        firebaseInicializado = true;
    } catch (error) {
        console.error("❌ Error al inicializar Firebase:", error);
        actualizarEstadoConexion(false, "Error de inicialización");
    }
}

function actualizarEstadoConexion(online, msg = "") {
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    if (!statusDot || !statusText) return;

    if (USAR_DEMO) {
        statusDot.className = "status-dot simulated";
        statusText.textContent = "Modo Simulación (Demo)";
    } else if (online) {
        statusDot.className = "status-dot";
        statusText.textContent = "Escrutinio En Línea";
    } else {
        statusDot.className = "status-dot simulated"; // Usamos amarillo/alerta
        statusText.textContent = msg || "Desconectado";
    }
}

// =========================================================================
// DATA DE SIMULACIÓN LOCAL (FALLBACK MOCK)
// =========================================================================
const mockEstudiantes = {
    "20261001": { nombre: "Estudiante de Prueba 1", ya_voto: true, fecha_voto: "2026-06-09T08:30:15.000Z" },
    "20261002": { nombre: "Estudiante de Prueba 2", ya_voto: true, fecha_voto: "2026-06-09T09:12:44.000Z" },
    "20261003": { nombre: "Estudiante de Prueba 3", ya_voto: false },
    "20261004": { nombre: "Estudiante de Prueba 4", ya_voto: true, fecha_voto: "2026-06-09T09:44:12.000Z" },
    "20261005": { nombre: "Estudiante de Prueba 5", ya_voto: false },
    "1234": { nombre: "admin", ya_voto: false }
};

const mockPartidos = [
    { 
        id: "partido-1", 
        nombre_partido: "Pixar", 
        candidata: "Keysha Arce Cordero", 
        foto_candidato: "imgs/pixar/candidato_1.webp",
        foto_bandera: "imgs/pixar/Bandera_pixar.webp",
        votos_acumulados: 2
    },
    { 
        id: "partido-2", 
        nombre_partido: "Trono", 
        candidato: "Daniel Morales", 
        foto_candidato: "imgs/trono/candidato_2.webp",
        foto_bandera: "imgs/trono/bandera_trono.webp",
        votos_acumulados: 1
    },
    { 
        id: "Voto_Nulo", 
        nombre_partido: "Voto Nulo", 
        candidato: "N/A", 
        votos_acumulados: 0
    }
];

// =========================================================================
// LÓGICA DE CARGA Y ACTUALIZACIÓN DE DATOS
// =========================================================================
let autoRefreshIntervalId = null;

async function cargarResultados() {
    const btnRefresh = document.getElementById("btn-refresh");
    const btnRefreshText = document.getElementById("btn-refresh-text");
    
    if (btnRefresh) btnRefresh.classList.add("loading");
    if (btnRefreshText) btnRefreshText.textContent = "Actualizando...";

    try {
        let totalPadron = 0;
        let votosEmitidos = 0;
        let partidosList = [];

        let votedStudentsList = [];

        if (USAR_DEMO) {
            await delay(500); // Pequeña simulación de retardo
            // Carga de padrón y participación
            const estudiantesArr = Object.values(mockEstudiantes);
            totalPadron = estudiantesArr.length;
            
            Object.keys(mockEstudiantes).forEach(id => {
                const e = mockEstudiantes[id];
                if (e.ya_voto) {
                    votedStudentsList.push({
                        id: id,
                        nombre: e.nombre,
                        fecha_voto: e.fecha_voto
                    });
                }
            });
            votosEmitidos = votedStudentsList.length;
            
            // Clonamos los partidos del mock para evitar mutaciones directas
            partidosList = mockPartidos.map(p => ({ ...p }));
        } else {
            inicializarFirebase();
            
            // 1. Obtener total padrón de forma eficiente (getCount)
            const padronCollRef = collection(db, "estudiantes");
            const padronSnap = await getCountFromServer(padronCollRef);
            totalPadron = padronSnap.data().count;

            // 2. Obtener lista completa de votantes con sus datos
            const votedQuery = query(collection(db, "estudiantes"), where("ya_voto", "==", true));
            const votedSnap = await getDocs(votedQuery);
            votosEmitidos = votedSnap.size;

            votedSnap.forEach(docSnap => {
                const data = docSnap.data();
                votedStudentsList.push({
                    id: docSnap.id,
                    nombre: data.nombre || "Estudiante",
                    fecha_voto: data.fecha_voto
                });
            });

            // 3. Obtener el recuento de partidos
            const querySnapshot = await getDocs(collection(db, "partidos"));
            querySnapshot.forEach((docSnap) => {
                let data = docSnap.data();
                if (docSnap.id === "Voto_Nulo") {
                    data.nombre_partido = data.nombre_partido || data.Voto_Nulo || "Voto Nulo";
                    data.candidato = data.candidato || "N/A";
                }
                partidosList.push({
                    id: docSnap.id,
                    ...data
                });
            });
        }

        // Ordenar estudiantes votantes cronológicamente (del más reciente al más antiguo)
        votedStudentsList.sort((a, b) => {
            const dateA = a.fecha_voto ? new Date(a.fecha_voto) : new Date(0);
            const dateB = b.fecha_voto ? new Date(b.fecha_voto) : new Date(0);
            return dateB - dateA;
        });

        // Encontrar votos nulos
        const nuloItem = partidosList.find(p => p.id === "Voto_Nulo") || { votos_acumulados: 0 };
        const votosNulos = nuloItem.votos_acumulados || 0;

        // Renderizar los KPIs superiores
        renderKPIs(totalPadron, votosEmitidos, votosNulos);

        // Renderizar los partidos políticos y sus estadísticas
        renderPartidosGrid(partidosList, votosEmitidos);

        // Renderizar gráfico de dona interactivo
        renderizarGrafico(partidosList);

        // Renderizar listado de auditoría de votantes
        renderizarVotantesList(votedStudentsList);

    } catch (error) {
        console.error("Error al cargar escrutinio:", error);
    } finally {
        if (btnRefresh) btnRefresh.classList.remove("loading");
        if (btnRefreshText) btnRefreshText.textContent = "Actualizar Resultados";
    }
}

function renderKPIs(totalPadron, votosEmitidos, votosNulos) {
    const valTotalPadron = document.getElementById("val-total-padron");
    const valTotalVoters = document.getElementById("val-total-voters");
    const valTotalNulls = document.getElementById("val-total-nulls");
    const lblParticipationPercent = document.getElementById("lbl-participation-percent");
    const lblNullsPercent = document.getElementById("lbl-nulls-percent");

    if (valTotalPadron) valTotalPadron.textContent = totalPadron;
    if (valTotalVoters) valTotalVoters.textContent = votosEmitidos;
    if (valTotalNulls) valTotalNulls.textContent = votosNulos;

    // Calcular porcentajes
    const partPercent = totalPadron > 0 ? ((votosEmitidos / totalPadron) * 100).toFixed(1) : "0.0";
    if (lblParticipationPercent) lblParticipationPercent.textContent = `${partPercent}% de participación`;

    const nullsPercent = votosEmitidos > 0 ? ((votosNulos / votosEmitidos) * 100).toFixed(1) : "0.0";
    if (lblNullsPercent) lblNullsPercent.textContent = `${nullsPercent}% del total de votos`;
}

function renderPartidosGrid(partidosList, votosEmitidos) {
    const partiesContainer = document.getElementById("results-parties-container");
    if (!partiesContainer) return;

    partiesContainer.innerHTML = "";

    // Ordenar partidos para que el Voto Nulo quede al final
    const normalPartidos = partidosList.filter(p => p.id !== "Voto_Nulo");
    const nullVoteItem = partidosList.find(p => p.id === "Voto_Nulo");

    // Ordenar partidos normales por número de votos de mayor a menor (opcional/deseable en dashboard)
    normalPartidos.sort((a, b) => (b.votos_acumulados || 0) - (a.votos_acumulados || 0));

    const sortedList = [...normalPartidos];
    if (nullVoteItem) sortedList.push(nullVoteItem);

    if (sortedList.length === 0) {
        partiesContainer.innerHTML = `<div class="results-party-card"><p>No se encontraron datos de candidaturas.</p></div>`;
        return;
    }

    sortedList.forEach(partido => {
        const isNulo = partido.id === "Voto_Nulo";
        const totalVotosAcumulados = partido.votos_acumulados || 0;
        
        // Calcular porcentaje del partido sobre los votos emitidos
        const percent = votosEmitidos > 0 ? ((totalVotosAcumulados / votosEmitidos) * 100).toFixed(1) : "0.0";

        // Mapear fotos y fallbacks similares a app.js
        let fotoUrl = partido.foto_candidato || partido.foto_candidata || "";
        const esPixar = partido.id === "partido-1" || (partido.nombre_partido && partido.nombre_partido.toLowerCase() === "pixar");
        const esTrono = partido.id === "partido-2" || (partido.nombre_partido && partido.nombre_partido.toLowerCase() === "trono");

        if (fotoUrl && typeof fotoUrl === "string") {
            fotoUrl = fotoUrl.trim();
            if (fotoUrl.startsWith("/")) fotoUrl = fotoUrl.substring(1);
            if (fotoUrl === "imgs/candidato_1.webp") fotoUrl = "imgs/pixar/candidato_1.webp";
            if (fotoUrl === "imgs/candidato_2.webp") fotoUrl = "imgs/trono/candidato_2.webp";
        }

        if (esPixar && (!fotoUrl || fotoUrl === "imgs/candidato_1.webp")) fotoUrl = "imgs/pixar/candidato_1.webp";
        if (esTrono && (!fotoUrl || fotoUrl === "imgs/candidato_2.webp")) fotoUrl = "imgs/trono/candidato_2.webp";

        const logoInicial = isNulo ? "Ø" : (partido.nombre_partido ? partido.nombre_partido.charAt(0).toUpperCase() : "P");
        const logoContenido = fotoUrl ? `<img src="${fotoUrl}" alt="Foto de ${partido.nombre_partido}">` : `<div class="party-logo-wrapper" style="width:100%;height:100%;margin-bottom:0;font-size:1.75rem;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,0.03);">${logoInicial}</div>`;

        let cardClass = "results-party-card";
        let cardStyle = "";
        let candidateLabel = "";

        if (isNulo) {
            cardClass += " nulls-card";
            candidateLabel = "Anulación voluntaria del voto";
        } else {
            if (esPixar) cardClass += " pixar-card";
            if (esTrono) cardClass += " trono-card";
            
            const nombreCandidato = partido.candidato || partido.candidata || "";
            const esFemenino = determinarGenero(nombreCandidato) === "femenino";
            candidateLabel = `${esFemenino ? "Candidata" : "Candidato"}: ${nombreCandidato}`;
        }

        const card = document.createElement("div");
        card.className = cardClass;
        
        card.innerHTML = `
            <div class="results-party-logo">
                ${logoContenido}
            </div>
            <div class="results-party-info">
                <div class="results-party-header">
                    <div class="results-party-names">
                        <span class="results-party-name">${partido.nombre_partido}</span>
                        <span class="results-candidate-name">${candidateLabel}</span>
                    </div>
                    <div class="results-party-votes-count">
                        <div class="results-vote-number">${totalVotosAcumulados} <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary);">votos</span></div>
                        <div class="results-vote-percent">${percent}%</div>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                </div>
            </div>
        `;

        partiesContainer.appendChild(card);
    });
}

function renderizarGrafico(partidosList) {
    const ctx = document.getElementById("chart-canvas");
    if (!ctx) return;

    if (resultsChart) {
        resultsChart.destroy();
    }

    const labels = partidosList.map(p => p.nombre_partido);
    const data = partidosList.map(p => p.votos_acumulados || 0);

    const backgroundColors = partidosList.map(p => {
        if (p.id === "partido-1" || p.nombre_partido.toLowerCase() === "pixar") {
            return "rgba(124, 58, 237, 0.8)";
        } else if (p.id === "partido-2" || p.nombre_partido.toLowerCase() === "trono") {
            return "rgba(14, 165, 233, 0.8)";
        } else {
            return "rgba(244, 63, 94, 0.8)";
        }
    });

    const borderColors = partidosList.map(p => {
        if (p.id === "partido-1" || p.nombre_partido.toLowerCase() === "pixar") {
            return "#7c3aed";
        } else if (p.id === "partido-2" || p.nombre_partido.toLowerCase() === "trono") {
            return "#0ea5e9";
        } else {
            return "#f43f5e";
        }
    });

    resultsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#f8fafc',
                        font: {
                            family: 'Plus Jakarta Sans',
                            size: 11,
                            weight: '600'
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 35, 0.85)',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    titleFont: { family: 'Outfit', weight: 'bold' },
                    bodyFont: { family: 'Plus Jakarta Sans' },
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const value = context.raw || 0;
                            return ` Votos: ${value}`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

function renderizarVotantesList(votedStudents) {
    const listContainer = document.getElementById("voted-students-list");
    const countBadge = document.getElementById("voted-count-badge");
    if (!listContainer) return;

    if (countBadge) {
        countBadge.textContent = `${votedStudents.length} Votantes`;
    }

    listContainer.innerHTML = "";

    if (votedStudents.length === 0) {
        listContainer.innerHTML = `<div style="font-size: 0.95rem; color: var(--text-secondary); text-align: center; padding: 2rem 0;">Ningún estudiante ha registrado su voto todavía.</div>`;
        return;
    }

    votedStudents.forEach(estudiante => {
        const item = document.createElement("div");
        item.className = "voted-student-item";

        let horaFormat = "N/A";
        if (estudiante.fecha_voto) {
            try {
                const date = new Date(estudiante.fecha_voto);
                horaFormat = date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch (e) {
                console.error("Error formatting date:", e);
            }
        }

        item.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span style="color: #fff; font-weight: 600;">${estudiante.nombre}</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">Carné: ${estudiante.id}</span>
            </div>
            <span style="color: var(--accent-cyan); font-family: var(--font-display); font-weight: 700;">${horaFormat}</span>
        `;
        listContainer.appendChild(item);
    });
}

// Determinación inteligente de género (mismo algoritmo que app.js)
function determinarGenero(nombre) {
    if (!nombre || nombre === "N/A") return "neutral";
    const primerNombre = nombre.trim().split(" ")[0].toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const nombresMasculinos = [
        "kevin", "julio", "jose", "juan", "luis", "carlos", "jorge", "andres", "david", 
        "daniel", "manuel", "francisco", "javier", "miguel", "angel", "pedro", "jesus", 
        "alejandro", "rafael", "fernando", "ricardo", "santiago", "sebastian", "mateo", 
        "nicolas", "diego", "samuel", "gabriel", "lucas", "tomas", "martin", "benjamin"
    ];
    
    const nombresFemeninos = [
        "elizabeth", "mauren", "elisabeth", "carmen", "isabel", "raquel", "ruth", 
        "mercedes", "luz", "beatriz", "pilar", "ines", "belen", "abigail", "esther"
    ];

    if (nombresMasculinos.includes(primerNombre)) return "masculino";
    if (nombresFemeninos.includes(primerNombre)) return "femenino";
    if (primerNombre.endsWith("a")) return "femenino";
    if (primerNombre.endsWith("o")) return "masculino";
    return "neutral";
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =========================================================================
// GESTIÓN DE EVENTOS E INTERFAZ
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    actualizarEstadoConexion(false, "Inicializando...");
    
    if (USAR_DEMO) {
        actualizarEstadoConexion(true);
    } else {
        inicializarFirebase();
    }

    // Carga de resultados inicial
    cargarResultados();

    // Evento de refrescar manual
    const btnRefresh = document.getElementById("btn-refresh");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", cargarResultados);
    }

    // Toggle de auto-actualización
    const chkAutoRefresh = document.getElementById("chk-auto-refresh");
    if (chkAutoRefresh) {
        chkAutoRefresh.addEventListener("change", (e) => {
            if (e.target.checked) {
                console.log("⏱️ Auto-actualización activada (10s)");
                autoRefreshIntervalId = setInterval(cargarResultados, 10000);
            } else {
                console.log("⏱️ Auto-actualización desactivada");
                if (autoRefreshIntervalId) {
                    clearInterval(autoRefreshIntervalId);
                    autoRefreshIntervalId = null;
                }
            }
        });
    }

    // Ver estudiantes que no votaron
    const btnViewNonVoters = document.getElementById("btn-view-non-voters");
    if (btnViewNonVoters) {
        btnViewNonVoters.addEventListener("click", () => {
            window.location.href = "novotaron.html";
        });
    }

    // Volver al tarjetón
    const btnBackToVote = document.getElementById("btn-back-to-vote");
    if (btnBackToVote) {
        btnBackToVote.addEventListener("click", () => {
            window.location.href = "index.html";
        });
    }

    // Restablecer elecciones (Admin Reset)
    const btnResetElection = document.getElementById("btn-reset-election");
    const resetSpinner = document.getElementById("reset-spinner");
    if (btnResetElection) {
        btnResetElection.addEventListener("click", async () => {
            const confirm1 = confirm("🚨 ATENCIÓN ELECTORAL 🚨\n\n¿Está seguro de que desea REINICIAR las elecciones?\n\nEsta acción borrará todos los votos de la base de datos y permitirá volver a votar a todos los estudiantes.");
            if (!confirm1) return;

            const confirm2 = confirm("⚠ CONFIRMACIÓN DE SEGURIDAD FINAL ⚠\n\n¿Realmente desea borrar todo y reiniciar los contadores a cero?");
            if (!confirm2) return;

            btnResetElection.disabled = true;
            if (resetSpinner) resetSpinner.style.display = "inline-block";

            try {
                if (USAR_DEMO) {
                    await delay(1200);
                    mockPartidos.forEach(p => {
                        p.votos_acumulados = 0;
                    });
                    Object.keys(mockEstudiantes).forEach(key => {
                        mockEstudiantes[key].ya_voto = false;
                        delete mockEstudiantes[key].fecha_voto;
                    });
                } else {
                    const partidosSnap = await getDocs(collection(db, "partidos"));
                    const batch = writeBatch(db);

                    partidosSnap.forEach(docSnap => {
                        batch.update(docSnap.ref, { votos_acumulados: 0 });
                    });

                    const votedQuery = query(collection(db, "estudiantes"), where("ya_voto", "==", true));
                    const votedSnap = await getDocs(votedQuery);

                    votedSnap.forEach(docSnap => {
                        batch.update(docSnap.ref, { 
                            ya_voto: false,
                            fecha_voto: null 
                        });
                    });

                    await batch.commit();
                }

                alert("✅ Las elecciones han sido restablecidas con éxito. Todos los contadores volvieron a cero.");
                cargarResultados();

            } catch (error) {
                console.error("Error al reiniciar elecciones:", error);
                alert("❌ Error al reiniciar elecciones: " + (error.message || error));
            } finally {
                btnResetElection.disabled = false;
                if (resetSpinner) resetSpinner.style.display = "none";
            }
        });
    }
});
