/**
 * Sistema de Votaciones Estudiantiles - Control de Estudiantes Pendientes (No Votaron)
 * Firebase Cloud Firestore (SDK v10+ Modular CDN)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    getCountFromServer
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
let allPendingStudents = []; // Variable global para guardar todos los estudiantes pendientes cargados

function inicializarFirebase() {
    if (firebaseInicializado) return;
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        signInAnonymously(auth)
            .then(() => {
                console.log("🔥 Conexión segura establecida con la mesa electoral.");
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
        statusDot.className = "status-dot simulated";
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
    "20261006": { nombre: "María Celeste Araya", ya_voto: false },
    "20261007": { nombre: "Justin Quirós Solano", ya_voto: false },
    "1234": { nombre: "admin", ya_voto: false }
};

// =========================================================================
// LÓGICA DE CARGA Y FILTRADO DE DATOS
// =========================================================================
let autoRefreshIntervalId = null;

async function cargarEstudiantesPendientes() {
    const btnRefresh = document.getElementById("btn-refresh");
    const btnRefreshText = document.getElementById("btn-refresh-text");
    
    if (btnRefresh) btnRefresh.classList.add("loading");
    if (btnRefreshText) btnRefreshText.textContent = "Actualizando...";

    try {
        let totalPadron = 0;
        let totalPending = 0;
        allPendingStudents = [];

        if (USAR_DEMO) {
            await delay(500); // Pequeña simulación de retardo
            const estudiantesArr = Object.entries(mockEstudiantes);
            totalPadron = estudiantesArr.length;

            estudiantesArr.forEach(([id, e]) => {
                if (!e.ya_voto) {
                    allPendingStudents.push({
                        id: id,
                        nombre: e.nombre || "Estudiante"
                    });
                }
            });
            totalPending = allPendingStudents.length;
        } else {
            inicializarFirebase();
            
            // 1. Obtener total padrón usando getCountFromServer
            const padronCollRef = collection(db, "estudiantes");
            const padronSnap = await getCountFromServer(padronCollRef);
            totalPadron = padronSnap.data().count;

            // 2. Obtener lista de estudiantes que no han votado
            const pendingQuery = query(collection(db, "estudiantes"), where("ya_voto", "==", false));
            const pendingSnap = await getDocs(pendingQuery);
            totalPending = pendingSnap.size;

            pendingSnap.forEach(docSnap => {
                const data = docSnap.data();
                allPendingStudents.push({
                    id: docSnap.id,
                    nombre: data.nombre || "Estudiante"
                });
            });
        }

        // Ordenar estudiantes pendientes alfabéticamente por nombre
        allPendingStudents.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        // Calcular votantes actuales para KPIs
        const totalVoted = totalPadron - totalPending;

        // Renderizar los KPIs superiores
        renderKPIs(totalPadron, totalPending, totalVoted);

        // Renderizar el listado en la interfaz aplicando el término de búsqueda actual si lo hay
        filtrarYRenderizarEstudiantes();

    } catch (error) {
        console.error("Error al cargar estudiantes pendientes:", error);
    } finally {
        if (btnRefresh) btnRefresh.classList.remove("loading");
        if (btnRefreshText) btnRefreshText.textContent = "Actualizar Lista";
    }
}

function renderKPIs(totalPadron, totalPending, totalVoted) {
    const valTotalPadron = document.getElementById("val-total-padron");
    const valTotalPending = document.getElementById("val-total-pending");
    const valTotalVoters = document.getElementById("val-total-voters");
    const lblParticipationPercent = document.getElementById("lbl-participation-percent");

    if (valTotalPadron) valTotalPadron.textContent = totalPadron;
    if (valTotalPending) valTotalPending.textContent = totalPending;
    if (valTotalVoters) valTotalVoters.textContent = totalVoted;

    // Calcular porcentaje de participación
    const partPercent = totalPadron > 0 ? ((totalVoted / totalPadron) * 100).toFixed(1) : "0.0";
    if (lblParticipationPercent) lblParticipationPercent.textContent = `${partPercent}% de participación`;
}

function filtrarYRenderizarEstudiantes() {
    const searchInput = document.getElementById("search-input");
    const queryStr = searchInput ? searchInput.value.trim().toLowerCase() : "";
    
    let filteredList = allPendingStudents;
    if (queryStr) {
        filteredList = allPendingStudents.filter(estudiante => {
            return estudiante.nombre.toLowerCase().includes(queryStr) || 
                   estudiante.id.toLowerCase().includes(queryStr);
        });
    }
    
    renderizarListado(filteredList);
}

function renderizarListado(estudiantes) {
    const listContainer = document.getElementById("pending-students-list");
    const countBadge = document.getElementById("pending-count-badge");
    if (!listContainer) return;

    if (countBadge) {
        countBadge.textContent = `${estudiantes.length} Pendientes`;
    }

    listContainer.innerHTML = "";

    if (estudiantes.length === 0) {
        listContainer.innerHTML = `<div style="font-size: 0.95rem; color: var(--text-secondary); text-align: center; padding: 2.25rem 0;">No se encontraron estudiantes pendientes.</div>`;
        return;
    }

    estudiantes.forEach(estudiante => {
        const item = document.createElement("div");
        item.className = "pending-student-item";

        item.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span style="color: #fff; font-weight: 600;">${estudiante.nombre}</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">Carné: ${estudiante.id}</span>
            </div>
            <span style="background: rgba(244, 63, 94, 0.1); color: #fda4af; font-size: 0.8rem; padding: 0.25rem 0.65rem; border-radius: 0.5rem; font-weight: 600;">Pendiente</span>
        `;
        listContainer.appendChild(item);
    });
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

    // Carga inicial
    cargarEstudiantesPendientes();

    // Evento de búsqueda en tiempo real
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", filtrarYRenderizarEstudiantes);
    }

    // Evento de refrescar manual
    const btnRefresh = document.getElementById("btn-refresh");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", cargarEstudiantesPendientes);
    }

    // Toggle de auto-actualización
    const chkAutoRefresh = document.getElementById("chk-auto-refresh");
    if (chkAutoRefresh) {
        chkAutoRefresh.addEventListener("change", (e) => {
            if (e.target.checked) {
                console.log("⏱️ Auto-actualización activada (10s)");
                autoRefreshIntervalId = setInterval(cargarEstudiantesPendientes, 10000);
            } else {
                console.log("⏱️ Auto-actualización desactivada");
                if (autoRefreshIntervalId) {
                    clearInterval(autoRefreshIntervalId);
                    autoRefreshIntervalId = null;
                }
            }
        });
    }

    // Volver a Resultados
    const btnBackToResults = document.getElementById("btn-back-to-results");
    if (btnBackToResults) {
        btnBackToResults.addEventListener("click", () => {
            window.location.href = "resultados.html";
        });
    }

    // Volver al tarjetón
    const btnBackToVote = document.getElementById("btn-back-to-vote");
    if (btnBackToVote) {
        btnBackToVote.addEventListener("click", () => {
            window.location.href = "index.html";
        });
    }
});
