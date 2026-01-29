// src/platform/auth/authUI.js
console.log('[AUTH UI] Loaded from:', import.meta.url);
window.__DTF_AUTHUI_URL__ = import.meta.url;
window.__DTF_AUTHUI_LOADED__ = true;

import * as authManager from './authManager.js';
import { getUser } from '../session/sessionManager.js';
import {
  ensureModalStructure,
  showModal,
  hideModal,
  initAuthModalManager,
  bindCloseButton,
  logAuthEvent
} from './authModalManager.js';

let currentMode = 'login'; // 'login' | 'register' | 'recovery'
let managedMode = false;
let isGateMode = false;
let lastForceOpenAt = 0;

// --- HTML Templates ---
const ASSET_VERSION = window.ASSET_VERSION || '20260128-1555'; // ⬅️ súbelo cada vez que publiques cambios
const CSS_URL = `/src/platform/auth/auth.css?v=${ASSET_VERSION}`;

const WIDGET_HTML = `
  <button id="btnLogin" class="auth-btn" type="button">
    <span id="auth-status-icon">👤</span>
    <span id="auth-status-text">Iniciar Sesión</span>
  </button>
`;

const MODAL_HTML = `
  <div class="auth-modal-backdrop" id="authBackdrop"></div>
  <div class="auth-modal-overlay" id="authModal" role="dialog" aria-modal="true">
    <div class="auth-card">
      <button class="auth-close" id="auth-close" type="button">&times;</button>

      <h2 class="auth-title" id="auth-title">Iniciar Sesión</h2>

      <div id="auth-message" class="auth-message"></div>

      <div id="auth-social-container">
        <button type="button" class="auth-google-btn" id="auth-google">
          <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right:8px">
            <path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"></path>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"></path>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"></path>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.159 6.656 3.58 9 3.58z" fill="#EA4335"></path>
          </svg>
          Continuar con Google
        </button>
        <div class="auth-separator">O</div>
      </div>

      <form id="auth-form" class="auth-form">
        <div class="auth-input-group">
          <label for="auth-email">Correo Electrónico</label>
          <input type="email" id="auth-email" class="auth-input" placeholder="ejemplo@empresa.com" required>
        </div>

        <div class="auth-input-group" id="group-password">
          <label for="auth-password">Contraseña</label>
          <input type="password" id="auth-password" class="auth-input" placeholder="******" required>
        </div>

        <button type="submit" class="auth-submit-btn" id="auth-submit">Entrar</button>
      </form>

      <div class="auth-footer" id="auth-footer"></div>
    </div>
  </div>
`;

// -------------------------
// Gate root
// -------------------------
function ensureGateRoot() {
  let root = document.getElementById('platform-gate-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'platform-gate-root';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.zIndex = '999999';
    root.style.pointerEvents = 'none';
    root.style.display = 'block';
    document.documentElement.appendChild(root);
    console.log('[AUTH UI] platform-gate-root created on documentElement');
  }
  root.style.display = 'block';
  return root;
}

// -------------------------
// BLINDAJE: Login click binding
// -------------------------
function bindLoginButtonEvents() {
  const loginBtn = document.getElementById('btnLogin');
  if (loginBtn && !loginBtn.dataset.bound) {
    loginBtn.dataset.bound = '1';
    loginBtn.style.pointerEvents = 'auto';
    loginBtn.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('✅ [AUTH UI] Click en #btnLogin capturado (direct bind)');
        handleLoginButtonClick();
      },
      { passive: false }
    );
  }

  if (!document.documentElement.dataset.authDelegationBound) {
    document.documentElement.dataset.authDelegationBound = '1';

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target?.closest?.('#btnLogin, [data-open-auth="login"], .auth-btn');
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        console.log('✅ [AUTH UI] Click login capturado (delegation backup)');
        handleLoginButtonClick();
      },
      true
    );
  }
}

// -------------------------
// Initialization
// -------------------------
export function initAuthUI() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUI, { once: true });
    return;
  }

  console.log('[AUTH UI] initAuthUI called');

  // Re-bindea SIEMPRE el login (aunque ya esté inited)
  bindLoginButtonEvents();

  if (window.__DTF_AUTH_UI_INITED__) {
    console.log('[AUTH UI] initAuthUI skipped (already inited)');
    return;
  }
  window.__DTF_AUTH_UI_INITED__ = true;

  // CSS
  if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
  }

  // Widget
  if (!document.getElementById('auth-widget')) {
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'auth-widget';
    widgetContainer.innerHTML = WIDGET_HTML;

    widgetContainer.style.position = 'fixed';
    widgetContainer.style.top = '10px';
    widgetContainer.style.right = '10px';
    widgetContainer.style.zIndex = '9999997';
    widgetContainer.style.pointerEvents = 'auto';

    document.body.appendChild(widgetContainer);
  }

  const widget = document.getElementById('auth-widget');
  if (widget) {
    widget.style.pointerEvents = 'auto';
    widget.style.zIndex = '9999997';
  }

  // Modal
  const gateRoot = ensureGateRoot();
  const { modal, backdrop } = ensureModalStructure(MODAL_HTML, gateRoot);
  if (modal) modal.style.pointerEvents = 'auto';
  if (backdrop) backdrop.style.pointerEvents = 'auto';

  managedMode = true;

  if (modal && !gateRoot.contains(modal)) gateRoot.appendChild(modal);
  if (backdrop && !gateRoot.contains(backdrop)) gateRoot.appendChild(backdrop);

  bindEvents();

  try {
    initAuthModalManager({
      onLoginClick: handleLoginButtonClick,
      onClose: closeModal,
      getIsGateMode: () => isGateMode
    });
  } catch (e) {
    console.warn('[AUTH UI] initAuthModalManager failed (non-fatal):', e);
  }

  bindCloseButton(closeModal, () => isGateMode);

  console.log('[AUTH UI] UI Inicializada correctamente.');
}

// -------------------------
// Bind events
// -------------------------
function bindEvents() {
  console.log('[AUTH UI] Enlazando eventos...');

  bindLoginButtonEvents();

  // Google
  const googleBtn = document.getElementById('auth-google');
  if (googleBtn && !googleBtn.dataset.bound) {
    googleBtn.dataset.bound = '1';
    googleBtn.addEventListener('click', async () => {
      clearMessage();

      const original = googleBtn.innerHTML;
      googleBtn.style.opacity = '0.7';
      googleBtn.style.pointerEvents = 'none';
      googleBtn.textContent = 'Conectando con Google...';

      const { error } = await authManager.signInWithGoogle();

      if (error) {
        showMessage(error.message || 'Error al conectar con Google', 'error');
        googleBtn.style.opacity = '1';
        googleBtn.style.pointerEvents = 'auto';
        googleBtn.innerHTML = original;
      }
    });
  }

  // Submit
  const form = document.getElementById('auth-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', handleFormSubmit);
  }

  // Footer links
  const footer = document.getElementById('auth-footer');
  if (footer && !footer.dataset.bound) {
    footer.dataset.bound = '1';
    footer.addEventListener('click', (e) => {
      const link = e.target?.closest?.('.auth-link');
      if (!link) return;
      const action = link.dataset.action;
      if (action) openModal(action);
    });
  }
}

// -------------------------
// Login button behavior
// -------------------------
function handleLoginButtonClick() {
  const user = getUser();
  if (user) {
    if (confirm(`Sesión iniciada como ${user.email}.\n¿Deseas cerrar sesión?`)) {
      handleLogout();
    }
  } else {
    openModal('login');
  }
}

// -------------------------
// Page lock overlay
// -------------------------
export function createPageLockOverlay(message = 'Cargando acceso…') {
  const existing = document.getElementById('page-lock-overlay');
  if (existing) {
    updatePageLockOverlay(message);
    return existing;
  }

  const overlay = document.createElement('div');
  overlay.id = 'page-lock-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '9999998';
  overlay.style.background = 'rgba(0,0,0,0.85)';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.pointerEvents = 'all';
  overlay.style.opacity = '1';
  overlay.style.visibility = 'visible';

  const style = document.createElement('style');
  style.textContent = '@keyframes dtfSpin{to{transform:rotate(360deg);}}';
  overlay.appendChild(style);

  const card = document.createElement('div');
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.alignItems = 'center';
  card.style.gap = '12px';
  card.style.padding = '24px 28px';
  card.style.borderRadius = '12px';
  card.style.background = '#151515';
  card.style.border = '1px solid #2a2a2a';
  card.style.boxShadow = '0 12px 30px rgba(0,0,0,0.45)';
  card.style.minWidth = '280px';

  const spinner = document.createElement('div');
  spinner.style.width = '36px';
  spinner.style.height = '36px';
  spinner.style.borderRadius = '50%';
  spinner.style.border = '3px solid rgba(255,255,255,0.2)';
  spinner.style.borderTopColor = '#6ea8ff';
  spinner.style.animation = 'dtfSpin 1s linear infinite';

  const title = document.createElement('div');
  title.textContent = 'DTF Studio Pro';
  title.style.fontSize = '1rem';
  title.style.fontWeight = '600';
  title.style.color = '#ffffff';

  const text = document.createElement('div');
  text.id = 'page-lock-message';
  text.textContent = message;
  text.style.fontSize = '0.9rem';
  text.style.color = '#c9c9c9';
  text.style.textAlign = 'center';

  card.appendChild(spinner);
  card.appendChild(title);
  card.appendChild(text);
  overlay.appendChild(card);
  document.documentElement.appendChild(overlay);
  return overlay;
}

export function updatePageLockOverlay(message) {
  const overlay = document.getElementById('page-lock-overlay');
  if (!overlay) return createPageLockOverlay(message);
  const text = overlay.querySelector('#page-lock-message');
  if (text) text.textContent = message;
  return overlay;
}

export function removePageLockOverlay() {
  const overlay = document.getElementById('page-lock-overlay');
  if (overlay) overlay.remove();
}

// ✅ ESTA ES LA FUNCIÓN QUE bootstrap.js ESTÁ PIDIENDO (nombre exacto)
export function showAuthLoaderError(message = 'Error cargando el sistema de acceso.') {
  console.error('[AUTH UI] showAuthLoaderError:', message);
  const overlay = document.getElementById('page-lock-overlay') || createPageLockOverlay('Error');

  try {
    updatePageLockOverlay(message);
  } catch {
    const msgEl = overlay.querySelector('#page-lock-message');
    if (msgEl) msgEl.textContent = message;
  }

  try {
    forceOpenGate('login');
  } catch (e) {
    console.error('[AUTH UI] forceOpenGate failed while showing loader error:', e);
  }
}

// ✅ Alias por compatibilidad si en algún lado usan el otro nombre
export const showAuthLoadError = showAuthLoaderError;

// -------------------------
// Gate helpers
// -------------------------
export function ensureGateVisible(mode = 'login') {
  let modal = document.getElementById('authModal');
  if (!modal) {
    initAuthUI();
    modal = document.getElementById('authModal');
  }
  forceOpenGate(mode);
  if (!modal) return false;
  if (!modal.classList.contains('active')) return false;

  const style = window.getComputedStyle(modal);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return true;
}

function clearForcedGateStyles(modal) {
  const backdrop = document.getElementById('authBackdrop');
  if (modal) {
    modal.style.display = '';
    modal.style.zIndex = '';
    modal.style.opacity = '';
    modal.style.visibility = '';
    modal.style.position = '';
    modal.style.inset = '';
    modal.style.pointerEvents = '';
    modal.style.background = '';
  }
  if (backdrop) {
    backdrop.style.display = '';
    backdrop.style.zIndex = '';
    backdrop.style.opacity = '';
    backdrop.style.visibility = '';
    backdrop.style.position = '';
    backdrop.style.inset = '';
    backdrop.style.pointerEvents = '';
    backdrop.style.background = '';
  }
}

export function setGateMode(enabled) {
  const modal = document.getElementById('authModal');
  const closeBtn = document.getElementById('auth-close');

  // ✅ corte de loop (el que preguntaste) — AQUÍ va perfecto
  if (enabled && isGateMode && modal?.classList.contains('active')) return;

  if (enabled) {
    isGateMode = true;
    if (modal) modal.classList.add('gate-mode');
    if (closeBtn) closeBtn.style.display = 'none';

    if (modal && !modal.classList.contains('active')) {
      openModal('login');
    } else {
      if (modal) modal.classList.add('active');
    }
  } else {
    isGateMode = false;
    if (modal) {
      modal.classList.remove('gate-mode');
      modal.classList.remove('active');
    }
    clearForcedGateStyles(modal);
    if (closeBtn) closeBtn.style.display = 'block';
    closeModal();
  }
}

export function forceOpenGate(mode = 'login') {
  const now = Date.now();
  if (now - lastForceOpenAt < 120) return;
  lastForceOpenAt = now;

  const gateRoot = ensureGateRoot();
  let modal = document.getElementById('authModal');
  let backdrop = document.getElementById('authBackdrop');

  if (!modal || !backdrop) {
    initAuthUI();
    modal = document.getElementById('authModal');
    backdrop = document.getElementById('authBackdrop');
  }

  if (!modal) {
    console.error('❌ [AUTH UI] Modal missing after initAuthUI');
    return;
  }

  if (!gateRoot.contains(modal)) gateRoot.appendChild(modal);
  if (backdrop && !gateRoot.contains(backdrop)) gateRoot.appendChild(backdrop);

  modal.classList.add('active', 'gate-mode');
  modal.style.display = 'flex';
  modal.style.zIndex = '9999999';
  modal.style.opacity = '1';
  modal.style.visibility = 'visible';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.pointerEvents = 'auto';

  if (backdrop) {
    backdrop.classList.add('active');
    backdrop.style.display = 'block';
    backdrop.style.zIndex = '9999998';
    backdrop.style.opacity = '1';
    backdrop.style.visibility = 'visible';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.pointerEvents = 'auto';
  }

  isGateMode = true;
  currentMode = mode;
  openModal(mode);
}

// -------------------------
// Modal open/close/render
// -------------------------
function openModal(mode) {
  currentMode = mode;

  const gateRoot = ensureGateRoot();
  const { modal, backdrop } = ensureModalStructure(MODAL_HTML, gateRoot);

  if (modal && !gateRoot.contains(modal)) gateRoot.appendChild(modal);
  if (backdrop && !gateRoot.contains(backdrop)) gateRoot.appendChild(backdrop);

  renderModalContent();
  showModal();
  logAuthEvent?.('openModal ejecutado', { mode });

  clearMessage();
  document.getElementById('auth-email')?.focus();
}

function closeModal() {
  if (isGateMode) return;
  const modal = document.getElementById('authModal');
  if (modal) {
    hideModal();
    clearForcedGateStyles(modal);
  }
}

function renderModalContent() {
  const title = document.getElementById('auth-title');
  const submitBtn = document.getElementById('auth-submit');
  const footer = document.getElementById('auth-footer');
  const passGroup = document.getElementById('group-password');
  const passInput = document.getElementById('auth-password');
  const socialContainer = document.getElementById('auth-social-container');

  if (!title || !submitBtn || !footer || !passGroup || !passInput) return;

  if (currentMode === 'login') {
    title.textContent = 'Iniciar Sesión';
    submitBtn.textContent = 'Entrar';
    passGroup.style.display = 'flex';
    passInput.required = true;
    if (socialContainer) socialContainer.style.display = 'block';
    footer.innerHTML = `
      <p>¿No tienes cuenta? <span class="auth-link" data-action="register">Regístrate</span></p>
      <p><span class="auth-link" data-action="recovery">Olvidé mi contraseña</span></p>
    `;
  } else if (currentMode === 'register') {
    title.textContent = 'Crear Cuenta';
    submitBtn.textContent = 'Registrarse';
    passGroup.style.display = 'flex';
    passInput.required = true;
    if (socialContainer) socialContainer.style.display = 'block';
    footer.innerHTML = `
      <p>¿Ya tienes cuenta? <span class="auth-link" data-action="login">Inicia Sesión</span></p>
    `;
  } else if (currentMode === 'recovery') {
    title.textContent = 'Recuperar Contraseña';
    submitBtn.textContent = 'Enviar Link';
    passGroup.style.display = 'none';
    passInput.required = false;
    if (socialContainer) socialContainer.style.display = 'none';
    footer.innerHTML = `
      <p><span class="auth-link" data-action="login">Volver a Iniciar Sesión</span></p>
    `;
  }

  footer.style.display = 'block';
  footer.style.visibility = 'visible';
  footer.style.opacity = '1';
}

// -------------------------
// Submit + Auth actions
// -------------------------
async function handleFormSubmit(e) {
  e.preventDefault();

  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;

  if (!email || (currentMode !== 'recovery' && !password)) {
    showMessage('Por favor completa todos los campos', 'error');
    return;
  }

  setLoading(true);
  clearMessage();

  try {
    let result;
    if (currentMode === 'login') result = await authManager.signIn(email, password);
    else if (currentMode === 'register') result = await authManager.signUp(email, password);
    else if (currentMode === 'recovery') result = await authManager.resetPassword(email);

    if (result?.error) {
      showMessage(result.error.message || 'Error en autenticación', 'error');
    } else {
      if (currentMode === 'recovery') showMessage('Te enviamos un correo para restablecer tu contraseña.', 'success');
      else if (currentMode === 'register' && !result?.session) showMessage('¡Cuenta creada! Revisa tu correo para confirmar.', 'success');
      else showMessage('¡Bienvenido!', 'success');
    }
  } catch (err) {
    showMessage(err?.message || 'Error inesperado', 'error');
  } finally {
    setLoading(false);
  }
}

async function handleLogout() {
  await authManager.signOut();
}

function setLoading(isLoading) {
  const btn = document.getElementById('auth-submit');
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.textContent = 'Procesando...';
  } else {
    btn.disabled = false;
    renderModalContent();
  }
}

function showMessage(msg, type) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-message ${type}`;
  el.style.display = 'block';
}

function clearMessage() {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.style.display = 'none';
  el.className = 'auth-message';
}

// -------------------------
// Global State Update
// -------------------------
export function updateUIState(user) {
  const btn = document.getElementById('btnLogin') || document.getElementById('auth-btn');
  const text = document.getElementById('auth-status-text');
  if (!text) return;

  if (user) {
    if (btn) btn.classList.add('logged-in');
    text.textContent = user.email?.split('@')?.[0] || 'Cuenta';
  } else {
    if (btn) btn.classList.remove('logged-in');
    text.textContent = 'Iniciar Sesión';
  }
}

export function requestLogin() {
  openModal('login');
}

// Auto-repair
const __gateObserver = new MutationObserver(() => {
  if (!isGateMode) return;
  const root = document.getElementById('platform-gate-root');
  const modal = document.getElementById('authModal');
  if (!root || !modal || !root.contains(modal)) {
    console.warn('[AUTH UI] Modal removed or moved. Auto-repairing.');
    forceOpenGate('login');
  }
});
__gateObserver.observe(document.documentElement, { childList: true, subtree: true });
