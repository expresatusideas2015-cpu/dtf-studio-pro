const DEBUG_AUTH = typeof window !== 'undefined' && !!window.__DTF_AUTH_DEBUG__;

function authDebugLog(...args) {
    if (DEBUG_AUTH) {
        console.log('[AUTH_UI]', ...args);
    }
}

let initialized = false;

export function ensureModalStructure(modalHTML, root) {
    let modal = document.getElementById('authModal');
    let backdrop = document.getElementById('authBackdrop');
    const legacyModal = document.getElementById('auth-modal');
    if (legacyModal && !modal) {
        legacyModal.id = 'authModal';
        modal = legacyModal;
    }
    if (modal && backdrop) {
        return { modal, backdrop };
    }
    if (!modalHTML) {
        return { modal, backdrop };
    }
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    const rootEl = root || document.body;
    const newBackdrop = container.querySelector('#authBackdrop');
    const newModal = container.querySelector('#authModal');
    if (!backdrop && newBackdrop) {
        newBackdrop.style.pointerEvents = 'auto';
        rootEl.appendChild(newBackdrop);
        backdrop = newBackdrop;
    }
    if (!modal && newModal) {
        newModal.style.pointerEvents = 'auto';
        rootEl.appendChild(newModal);
        modal = newModal;
    }
    return { modal, backdrop };
}

export function showModal() {
    const modal = document.getElementById('authModal');
    const backdrop = document.getElementById('authBackdrop');
    if (backdrop) {
        backdrop.classList.add('active');
        backdrop.style.display = 'block';
        backdrop.style.opacity = '1';
        backdrop.style.visibility = 'visible';
        backdrop.style.pointerEvents = 'auto';
        backdrop.style.zIndex = '9999998';
    }
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        modal.style.pointerEvents = 'auto';
        modal.style.zIndex = '9999999';
        const style = window.getComputedStyle(modal);
        authDebugLog('modal visible', { display: style.display, opacity: style.opacity, zIndex: style.zIndex });
    }
    return { modal, backdrop };
}

export function hideModal() {
    const modal = document.getElementById('authModal');
    const backdrop = document.getElementById('authBackdrop');
    if (modal) {
        modal.classList.remove('active');
    }
    if (backdrop) {
        backdrop.classList.remove('active');
    }
}

export function openModal() {
    return showModal();
}

export function closeModal() {
    return hideModal();
}

export function toggleModal() {
    const modal = document.getElementById('authModal');
    if (modal && modal.classList.contains('active')) {
        return hideModal();
    }
    return showModal();
}

export function initAuthModalManager({ onLoginClick, onClose, getIsGateMode }) {
    if (initialized) {
        return;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initAuthModalManager({ onLoginClick, onClose, getIsGateMode }), { once: true });
        return;
    }
    initialized = true;
    const btn = document.getElementById('btnLogin');
    if (btn) {
        authDebugLog('boton detectado', btn);
        btn.addEventListener('click', () => {
            authDebugLog('click recibido');
            if (onLoginClick) onLoginClick();
        });
    } else {
        authDebugLog('boton no encontrado');
    }
    document.addEventListener('click', (e) => {
        const target = e.target;
        const btnEl = target && target.closest ? target.closest('#btnLogin') : null;
        if (btnEl) {
            authDebugLog('click delegado');
            if (onLoginClick) onLoginClick();
            return;
        }
        const backdrop = document.getElementById('authBackdrop');
        if (backdrop && target === backdrop) {
            authDebugLog('click backdrop');
            if (!getIsGateMode || !getIsGateMode()) {
                if (onClose) onClose();
            }
        }
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            authDebugLog('esc');
            if (!getIsGateMode || !getIsGateMode()) {
                if (onClose) onClose();
            }
        }
    });
    bindCloseButton(onClose, getIsGateMode);
}

export function bindCloseButton(onClose, getIsGateMode) {
    const closeBtn = document.getElementById('auth-close');
    if (!closeBtn || closeBtn.dataset.bound === 'true') {
        return;
    }
    closeBtn.dataset.bound = 'true';
    closeBtn.addEventListener('click', () => {
        authDebugLog('click cerrar');
        if (!getIsGateMode || !getIsGateMode()) {
            if (onClose) onClose();
        }
    });
}

export function authDebugEnabled() {
    return DEBUG_AUTH;
}

export function logAuthEvent(message, data) {
    if (DEBUG_AUTH) {
        console.log('[AUTH_UI]', message, data || '');
    }
}
