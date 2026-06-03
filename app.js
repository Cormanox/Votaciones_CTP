/**
 * Sistema de Votaciones Estudiantiles SPA - Core Logic
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
    runTransaction 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getAuth, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// =========================================================================
// CONFIGURACIÓN E INTERRUPTOR DE SIMULACIÓN (DEMO MODE)
// =========================================================================
// Desactivamos el modo DEMO para enlazar directamente con tu base de datos real
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

// Inicialización de Firebase y Autenticación Anónima
let db = null;
let auth = null;

if (!USAR_DEMO) {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // Autenticación silenciosa para cumplir con las reglas de seguridad de Firebase
        signInAnonymously(auth)
            .then(() => {
                console.log("🔥 Conexión segura establecida con la mesa electoral.");
            })
            .catch((error) => {
                console.error("❌ Error en autenticación anónima:", error);
            });
            
    } catch (error) {
        console.error("❌ Error al inicializar Firebase. Cambiando a Modo Simulación.", error);
    }
}

// =========================================================================
// DATA DE SIMULACIÓN LOCAL (FALLBACK EN CASO DE ACTIVAR EL MODO DEMO)
// =========================================================================
const mockEstudiantes = {
    "20261001": { nombre: "Estudiante de Prueba 1", ya_voto: false },
    "20261002": { nombre: "Estudiante de Prueba 2", ya_voto: true }
};

const mockPartidos = [
    { 
        id: "partido-1", 
        nombre_partido: "Pixar", 
        candidata: "Keysha Arce Cordero", 
        foto_candidato: "imgs/pixar/candidato_1.webp",
        foto_bandera: "imgs/pixar/Bandera_pixar.webp",
        Vicepresidente: "Kevin García Arroliga",
        Secretario: "Elizabeth Barquero Vargas",
        Tesorera: "Julio Sibaja Santamaría",
        Vocal: "Mauren Porras Alvarado",
        votos_acumulados: 0 
    },
    { 
        id: "partido-2", 
        nombre_partido: "Trono", 
        candidato: "Daniel Morales", 
        foto_candidato: "imgs/trono/candidato_2.webp",
        foto_bandera: "imgs/trono/bandera_trono.webp",
        Vicepresidenta: "Kristel Arguedas Mayorga",
        Secretario: "Daniel Esteban Oses",
        Tesorera: "Yuviza López Vargas",
        Vocal: "Dereck Chavarría Montenegro",
        votos_acumulados: 0 
    },
    { id: "Voto_Nulo", nombre_partido: "Voto Nulo", candidato: "N/A", votos_acumulados: 0 }
];

// =========================================================================
// ELEMENTOS DEL DOM
// =========================================================================
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const scanView = document.getElementById("scan-view");
const votingView = document.getElementById("voting-view");
const successView = document.getElementById("success-view");

const scanForm = document.getElementById("scan-form");
const carnetInput = document.getElementById("carnet-input");
const btnVerify = document.getElementById("btn-verify");
const verifySpinner = document.getElementById("verify-spinner");

const errorBanner = document.getElementById("error-banner");
const errorMessage = document.getElementById("error-message");

const studentNameLabel = document.getElementById("student-name");
const partiesContainer = document.getElementById("parties-container");

const confirmModal = document.getElementById("confirm-modal");
const modalPartyName = document.getElementById("modal-party-name");
const modalCandidateName = document.getElementById("modal-candidate-name");
const btnModalCancel = document.getElementById("btn-modal-cancel");
const btnModalConfirm = document.getElementById("btn-modal-confirm");

let estudianteActual = null; 
let partidoSeleccionado = null; 

// =========================================================================
// CONTROLADOR DE VISTAS (Navegación SPA)
// =========================================================================
function showView(targetView) {
    const views = [scanView, votingView, successView];
    
    views.forEach(view => {
        if (view === targetView) {
            view.style.display = "flex";
            setTimeout(() => {
                view.classList.add("active");
            }, 50);
        } else {
            view.classList.remove("active");
            view.style.display = "none";
        }
    });
}

// =========================================================================
// GESTIÓN DE AUTO-FOCUS (Especial para lectores de códigos de barra físicos)
// =========================================================================
function focusScannerInput() {
    if (scanView && scanView.classList.contains("active")) {
        carnetInput.focus();
    }
}

window.addEventListener("DOMContentLoaded", () => {
    if (USAR_DEMO) {
        if(statusDot) statusDot.className = "status-dot simulated";
        if(statusText) statusText.textContent = "Modo Simulación (Demo)";
    } else {
        if(statusDot) statusDot.className = "status-dot";
        if(statusText) statusText.textContent = "Firestore En Línea";
    }
    
    focusScannerInput();
});

if (scanView) {
    scanView.addEventListener("click", () => {
        focusScannerInput();
    });
}

// =========================================================================
// CONTROLADORES DE EVENTOS - ESCANEO Y VERIFICACIÓN
// =========================================================================
if (scanForm) {
    scanForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideError();
        
        const carnetId = carnetInput.value.trim();
        if (!carnetId) return;

        setLoadingState(true);

        try {
            let estudianteValido = null;

            if (USAR_DEMO) {
                await delay(600);
                if (mockEstudiantes[carnetId]) {
                    estudianteValido = { id: carnetId, ...mockEstudiantes[carnetId] };
                }
            } else {
                // Consulta directa a la colección en la nube usando el carné como ID de documento
                const docRef = doc(db, "estudiantes", carnetId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    estudianteValido = {
                        id: docSnap.id,
                        ...docSnap.data()
                    };
                }
            }

            if (!estudianteValido) {
                playErrorSound();
                showError("Código de carné no registrado en el padrón electoral.");
                setLoadingState(false);
                carnetInput.select();
                return;
            }

            if (estudianteValido.ya_voto) {
                playErrorSound();
                showError(`El estudiante ${estudianteValido.nombre} ya ejerció su derecho al voto.`);
                setLoadingState(false);
                carnetInput.select();
                return;
            }

            estudianteActual = {
                id: estudianteValido.id,
                nombre: estudianteValido.nombre
            };

            playSuccessSound();

            if (studentNameLabel) studentNameLabel.textContent = estudianteActual.nombre;
            
            await cargarYRenderizarPartidos();
            
            setLoadingState(false);
            showView(votingView);

        } catch (err) {
            console.error("Error durante verificación:", err);
            playErrorSound();
            showError(`Error de conexión o configuración: ${err.message || err}`);
            setLoadingState(false);
        }
    });
}

// =========================================================================
// RENDERIZADO DEL TARJETÓN ELECTORAL
// =========================================================================
async function cargarYRenderizarPartidos() {
    if (!partiesContainer) return;
    partiesContainer.innerHTML = ""; 
    
    try {
        let partidosList = [];

        if (USAR_DEMO) {
            partidosList = [...mockPartidos];
        } else {
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

        if (partidosList.length === 0) {
            partiesContainer.innerHTML = `<div class="party-card"><p>No se encontraron partidos registrados en el sistema.</p></div>`;
            return;
        }

        // Colocar el Voto Nulo en el medio de la lista
        const nuloIndex = partidosList.findIndex(p => p.id === "Voto_Nulo");
        if (nuloIndex !== -1) {
            const [nuloItem] = partidosList.splice(nuloIndex, 1);
            const middleIndex = Math.floor(partidosList.length / 2);
            partidosList.splice(middleIndex, 0, nuloItem);
        }

        partidosList.forEach(partido => {
            const card = document.createElement("div");
            card.className = "party-card";
            if (partido.id === "Voto_Nulo") {
                card.classList.add("null-vote-card");
            }
            
            const logoInicial = partido.id === "Voto_Nulo" ? "Ø" : (partido.nombre_partido ? partido.nombre_partido.charAt(0).toUpperCase() : "P");
            
            // Decidir si mostrar la foto del candidato o la letra inicial
            let logoContenido = logoInicial;
            let fotoUrl = partido.foto_candidato || partido.foto_candidata;

            // Normalizar la ruta del candidato eliminando barras iniciales (soporte en file:// protocol)
            if (fotoUrl && typeof fotoUrl === "string") {
                fotoUrl = fotoUrl.trim();
                if (fotoUrl.startsWith("/")) {
                    fotoUrl = fotoUrl.substring(1);
                }
                // Corregir si apunta a la ruta incorrecta o desactualizada
                if (fotoUrl === "imgs/candidato_1.webp") {
                    fotoUrl = "imgs/pixar/candidato_1.webp";
                }
                if (fotoUrl === "imgs/candidato_2.webp") {
                    fotoUrl = "imgs/trono/candidato_2.webp";
                }
            }

            // Detectar si es el partido Pixar para aplicar fallback de foto si está vacía o es incorrecta
            const esPixar = (
                (partido.candidato && (partido.candidato.includes("Keysha") || partido.candidato.includes("Arce"))) ||
                (partido.candidata && (partido.candidata.includes("Keysha") || partido.candidata.includes("Arce"))) ||
                (partido.nombre_partido && partido.nombre_partido.toLowerCase() === "pixar") ||
                partido.id === "partido-1"
            );

            if (esPixar && (!fotoUrl || fotoUrl === "imgs/candidato_1.webp")) {
                fotoUrl = "imgs/pixar/candidato_1.webp";
            }

            // Detectar si es el partido Trono para aplicar fallback de foto si está vacía o es incorrecta
            const esTrono = (
                (partido.candidato && (partido.candidato.includes("Daniel") || partido.candidato.includes("Morales"))) ||
                (partido.candidata && (partido.candidata.includes("Daniel") || partido.candidata.includes("Morales"))) ||
                (partido.nombre_partido && partido.nombre_partido.toLowerCase() === "trono") ||
                partido.id === "partido-2"
            );

            if (esTrono && (!fotoUrl || fotoUrl === "imgs/candidato_2.webp")) {
                fotoUrl = "imgs/trono/candidato_2.webp";
            }

            const nombreCandidato = partido.candidato || partido.candidata || "";

            if (fotoUrl) {
                logoContenido = `<img src="${fotoUrl}" alt="Foto de ${nombreCandidato}" class="party-logo-img">`;
            }
            
            let candidateText = "";
            if (partido.id === "Voto_Nulo") {
                candidateText = "Anulación voluntaria del voto";
            } else if (nombreCandidato && nombreCandidato !== "N/A") {
                const labelCandidato = determinarGenero(nombreCandidato) === "femenino" ? "Candidata" : "Candidato";
                candidateText = `${labelCandidato}: ${nombreCandidato}`;
            } else {
                candidateText = "Voto de Opinión Directa";
            }

            let committeeHTML = "";
            if (partido.id !== "Voto_Nulo") {
                const valVice = partido.Vicepresidente || partido.Vicepresidenta;
                const valSec = partido.Secretario || partido.Secretaria;
                const valTes = partido.Tesorera || partido.Tesorero;
                const valVoc = partido.Vocal;

                const labelVice = valVice ? (determinarGenero(valVice) === "femenino" ? "Vicepresidenta" : "Vicepresidente") : "";
                const labelSec = valSec ? (determinarGenero(valSec) === "femenino" ? "Secretaria" : "Secretario") : "";
                const labelTes = valTes ? (determinarGenero(valTes) === "femenino" ? "Tesorera" : "Tesorero") : "";
                const labelVoc = valVoc ? (determinarGenero(valVoc) === "femenino" ? "Vocal" : "Vocal") : "";

                committeeHTML = `
                    <div class="party-committee">
                        ${valVice ? `<div class="committee-member"><span class="member-role">${labelVice}:</span> <span class="member-name">${valVice}</span></div>` : ""}
                        ${valSec ? `<div class="committee-member"><span class="member-role">${labelSec}:</span> <span class="member-name">${valSec}</span></div>` : ""}
                        ${valTes ? `<div class="committee-member"><span class="member-role">${labelTes}:</span> <span class="member-name">${valTes}</span></div>` : ""}
                        ${valVoc ? `<div class="committee-member"><span class="member-role">${labelVoc}:</span> <span class="member-name">${valVoc}</span></div>` : ""}
                    </div>
                `;
            }

            let flagHTML = "";
            let banderaUrl = partido.foto_bandera || partido.bandera;

            // Normalizar la ruta de la bandera eliminando barras iniciales (soporte en file:// protocol)
            if (banderaUrl && typeof banderaUrl === "string") {
                banderaUrl = banderaUrl.trim();
                if (banderaUrl.startsWith("/")) {
                    banderaUrl = banderaUrl.substring(1);
                }
            }

            if (!banderaUrl && esPixar) {
                banderaUrl = "imgs/pixar/Bandera_pixar.webp";
            }

            if (!banderaUrl && esTrono) {
                banderaUrl = "imgs/trono/bandera_trono.webp";
            }

            if (banderaUrl) {
                flagHTML = `
                    <div class="party-flag-wrapper">
                        <img src="${banderaUrl}" alt="Bandera de ${partido.nombre_partido}" class="party-flag-img">
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="party-logo-wrapper">${logoContenido}</div>
                <h4 class="party-name">${partido.nombre_partido}</h4>
                <p class="party-candidate">${candidateText}</p>
                ${committeeHTML}
                ${flagHTML}
                <button class="btn-vote-card">Seleccionar</button>
            `;

            card.addEventListener("click", () => {
                abrirConfirmacion(partido);
            });

            partiesContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Error al cargar partidos:", err);
        partiesContainer.innerHTML = `<div class="party-card"><p>Error al cargar el tarjetón. Por favor contacte al comité.</p></div>`;
    }
}

// =========================================================================
// MODAL DE CONFIRMACIÓN DE VOTO
// =========================================================================
function abrirConfirmacion(partido) {
    partidoSeleccionado = partido;
    if (modalPartyName) modalPartyName.textContent = partido.nombre_partido;
    if (modalCandidateName) {
        if (partido.id === "Voto_Nulo") {
            modalCandidateName.textContent = "Anulación voluntaria del voto";
        } else {
            const nombreCandidato = partido.candidato || partido.candidata;
            if (nombreCandidato && nombreCandidato !== "N/A") {
                const labelCandidato = determinarGenero(nombreCandidato) === "femenino" ? "Candidata" : "Candidato";
                modalCandidateName.textContent = `${labelCandidato}: ${nombreCandidato}`;
            } else {
                modalCandidateName.textContent = "Opción de Voto en Blanco";
            }
        }
    }
    if (confirmModal) confirmModal.classList.add("active");
}

function cerrarConfirmacion() {
    if (confirmModal) confirmModal.classList.remove("active");
    partidoSeleccionado = null;
}

if (btnModalCancel) btnModalCancel.addEventListener("click", cerrarConfirmacion);

// =========================================================================
// REGISTRO DE VOTO (TRANSACCIÓN ATÓMICA DE SEGURIDAD)
// =========================================================================
if (btnModalConfirm) {
    btnModalConfirm.addEventListener("click", async () => {
        if (!estudianteActual || !partidoSeleccionado) return;

        btnModalConfirm.disabled = true;
        btnModalCancel.disabled = true;
        btnModalConfirm.textContent = "Procesando...";

        try {
            if (USAR_DEMO) {
                await delay(1000);
                const estudiante = mockEstudiantes[estudianteActual.id];
                
                if (estudiante.ya_voto) {
                    throw new Error("El estudiante ya ha votado previamente.");
                }

                estudiante.ya_voto = true;
                const partidoRef = mockPartidos.find(p => p.id === partidoSeleccionado.id);
                if (partidoRef) {
                    partidoRef.votos_acumulados += 1;
                }
            } else {
                // TRANSACCIÓN ATÓMICA FIRESTORE (Evita fraudes y asegura concurrencia perfecta)
                const estudianteDocRef = doc(db, "estudiantes", estudianteActual.id);
                const partidoDocRef = doc(db, "partidos", partidoSeleccionado.id);

                await runTransaction(db, async (transaction) => {
                    const estudianteSnap = await transaction.get(estudianteDocRef);
                    if (!estudianteSnap.exists()) {
                        throw new Error("El documento de estudiante no existe.");
                    }
                    
                    const yaVotoEstado = estudianteSnap.data().ya_voto;
                    if (yaVotoEstado) {
                        throw new Error("El estudiante ya ha registrado un voto en esta jornada.");
                    }

                    const partidoSnap = await transaction.get(partidoDocRef);
                    if (!partidoSnap.exists()) {
                        throw new Error("El partido seleccionado no existe.");
                    }

                    const votosActuales = partidoSnap.data().votos_acumulados || 0;

                    // Escritura segura simultánea
                    transaction.update(estudianteDocRef, { ya_voto: true });
                    transaction.update(partidoDocRef, { votos_acumulados: votosActuales + 1 });
                });
            }

            cerrarConfirmacion();
            showView(successView);

            setTimeout(() => {
                resetCicloElectoral();
            }, 3000);

        } catch (err) {
            console.error("Error crítico en transacción de voto:", err);
            alert(`Error al procesar el voto: ${err.message || err}. El tarjetón se reiniciará por seguridad.`);
            cerrarConfirmacion();
            resetCicloElectoral();
        } finally {
            if (btnModalConfirm) {
                btnModalConfirm.disabled = false;
                btnModalConfirm.textContent = "Confirmar Voto";
            }
            if (btnModalCancel) btnModalCancel.disabled = false;
        }
    });
}

// =========================================================================
// REINICIO DEL CICLO ELECTORAL
// =========================================================================
function resetCicloElectoral() {
    estudianteActual = null;
    partidoSeleccionado = null;
    
    if (carnetInput) carnetInput.value = "";
    hideError();
    setLoadingState(false);
    
    showView(scanView);
    
    setTimeout(() => {
        focusScannerInput();
    }, 100);
}

// =========================================================================
// FUNCIONES AUXILIARES Y DE INTERFAZ DE USUARIO
// =========================================================================
function setLoadingState(isLoading) {
    if (!btnVerify || !verifySpinner || !carnetInput) return;
    if (isLoading) {
        btnVerify.disabled = true;
        verifySpinner.style.display = "inline-block";
        carnetInput.disabled = true;
    } else {
        btnVerify.disabled = false;
        verifySpinner.style.display = "none";
        carnetInput.disabled = false;
    }
}

function showError(msg) {
    if (!errorMessage || !errorBanner) return;
    errorMessage.textContent = msg;
    errorBanner.style.display = "flex";
}

function hideError() {
    if (errorBanner) errorBanner.style.display = "none";
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =========================================================================
// SINTETIZADOR DE SONIDOS (Web Audio API - Timbres Físicos Reales)
// =========================================================================
function playSuccessSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        
        // Acorde arpegiado ascendente en Do Mayor (Do5, Mi5, Sol5, Do6)
        // Crea una sensación de confirmación de pago digital/acceso concedido moderna y cálida
        const notes = [523.25, 659.25, 783.99, 1046.50]; 
        
        notes.forEach((freq, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "sine";
            // Aplica un leve retraso de 70ms entre cada nota para el arpegio
            const noteStart = now + (index * 0.07);
            osc.frequency.setValueAtTime(freq, noteStart);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(0.70, noteStart + 0.03); // Volumen aumentado a 0.70 para máxima potencia
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.35); // Desvanecimiento suave
            
            osc.start(noteStart);
            osc.stop(noteStart + 0.4);
        });
    } catch (e) {
        console.warn("Web Audio API no soportado o bloqueado por el navegador:", e);
    }
}

function playErrorSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        
        // Frecuencias base disonantes y tensas combinadas en paralelo (efecto de batido grueso)
        const freqs = [140, 144]; // Frecuencias gruesas y de advertencia
        
        // Pulso 1: ¡BZZZT! potente y asertivo (0.0s a 0.22s)
        freqs.forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "square"; // Onda cuadrada (máxima audibilidad y robustez)
            osc.frequency.setValueAtTime(freq, now);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.85, now + 0.02); // Volumen aumentado a 0.85 (máxima potencia)
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
            
            osc.start(now);
            osc.stop(now + 0.22);
        });
        
        // Pulso 2: ¡BZZZT! de tono más bajo y grave con retardo de 240ms (0.24s a 0.55s)
        freqs.forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "square";
            osc.frequency.setValueAtTime(freq * 0.85, now + 0.24); // Caída a ~120Hz para tono dramático
            
            const pulseStart = now + 0.24;
            gain.gain.setValueAtTime(0, now);
            gain.gain.setValueAtTime(0, pulseStart);
            gain.gain.linearRampToValueAtTime(0.85, pulseStart + 0.02); // Volumen aumentado a 0.85 (máxima potencia)
            gain.gain.exponentialRampToValueAtTime(0.0001, pulseStart + 0.31);
            
            osc.start(pulseStart);
            osc.stop(pulseStart + 0.35);
        });
    } catch (e) {
        console.warn("Web Audio API no soportado o bloqueado:", e);
    }
}

// =========================================================================
// DETECTOR INTELIGENTE DE GÉNERO PARA CARGOS ELECTORALES
// =========================================================================
function determinarGenero(nombre) {
    if (!nombre || nombre === "N/A" || nombre === "Vicepresidente" || nombre === "Secretario" || nombre === "Tesorera" || nombre === "Vocal") {
        return "neutral";
    }
    
    // Obtener el primer nombre en minúsculas y sin acentos
    const primerNombre = nombre.trim().split(" ")[0].toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar tildes
        
    // Lista de nombres masculinos comunes que no terminan en 'o' o que podrían confundir
    const nombresMasculinos = [
        "kevin", "julio", "jose", "juan", "luis", "carlos", "jorge", "andres", "david", 
        "daniel", "manuel", "francisco", "javier", "miguel", "angel", "pedro", "jesus", 
        "alejandro", "rafael", "fernando", "ricardo", "santiago", "sebastian", "mateo", 
        "nicolas", "diego", "samuel", "gabriel", "lucas", "tomas", "martin", "benjamin",
        "jorge", "victor", "hector", "oscar", "ruben", "adrian", "ivan", "raul", "marcos",
        "joaquin", "felipe", "hugo", "ian", "thiago", "dylan", "liam", "noah", "axel"
    ];
    
    // Lista de nombres femeninos comunes que no terminan en 'a'
    const nombresFemeninos = [
        "elizabeth", "mauren", "elisabeth", "carmen", "isabel", "raquel", "ruth", 
        "mercedes", "luz", "beatriz", "pilar", "ines", "belen", "abigail", "esther", 
        "miriam", "judith", "noemi", "vivian", "karen", "genesis", "angie", "heidi", 
        "nelly", "astrid", "iris", "sol", "dulce", "monserrat", "lupita", "irene",
        "kristel"
    ];

    if (nombresMasculinos.includes(primerNombre)) {
        return "masculino";
    }
    
    if (nombresFemeninos.includes(primerNombre)) {
        return "femenino";
    }
    
    // Si termina en 'a', suele ser femenino en español (ej. Keysha, Maria, Ana, etc.)
    if (primerNombre.endsWith("a")) {
        return "femenino";
    }
    
    // Si termina en 'o', suele ser masculino
    if (primerNombre.endsWith("o")) {
        return "masculino";
    }
    
    return "neutral"; // Por defecto
}