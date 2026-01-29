# Checklist Técnico de Verificación - Platform Guardian (Bloque 2.4)

## 1. Integridad de Inicio (Boot)
- [ ] **Initial Gate**: Al cargar `index.html` sin sesión, debe aparecer inmediatamente el Access Gate (Fullscreen negro).
- [ ] **No Editor**: El editor (Canvas, Paneles) NO debe ser visible ni interactivo detrás del Gate.
- [ ] **Console Log**: Debe aparecer `🛡️ [Guardian] Inicializando Platform Guardian...`.
- [ ] **State**: El estado inicial debe transicionar de `BOOTING` -> `NO_SESSION` (si no hay cookie).

## 2. Flujo de Autenticación
- [ ] **Login**: Al iniciar sesión correctamente (Email/Pass o Google), el Gate debe desaparecer.
- [ ] **Mount**: La consola debe mostrar `🛡️ [Guardian] ✅ Montando Editor Core...` solo la primera vez.
- [ ] **Restore**: El proyecto anterior debe cargarse automáticamente (si existe).

## 3. Protección de Sesión (Runtime)
- [ ] **Logout**: Al hacer clic en Logout, la pantalla debe volverse negra (Gate) inmediatamente.
- [ ] **Freeze**: El editor debe quedar congelado (`pointer-events: none`) pero visible brevemente antes de que el Gate lo cubra (o cubierto totalmente).
- [ ] **State**: El estado debe cambiar a `NO_SESSION` o `LOCKED`.
- [ ] **No Destruction**: Verificar que `canvas` y `sheetsManager` siguen en memoria (no se reinician variables).

## 4. Re-conexión
- [ ] **Relogin**: Al volver a entrar con la misma cuenta.
- [ ] **Unfreeze**: El Gate desaparece y el editor vuelve a ser interactivo.
- [ ] **No Remount**: NO debe aparecer `Montando Editor Core` en consola. Debe decir `🔓 Descongelando Editor...`.
- [ ] **Data Integrity**: Las hojas y objetos que estaban antes del logout deben seguir ahí intactos.

## 5. Seguridad UI
- [ ] **Gate Mode**: Intentar cerrar el modal de login presionando ESC o clic fuera. NO debe cerrarse.
- [ ] **Overlay**: El fondo debe ser opaco (`#000`) y no permitir ver el trabajo debajo.
- [ ] **Events**: Verificar en consola que se emiten `platform:boot`, `platform:ready` y `platform:locked`.

## 6. Validación de Código
- [ ] **app.js**: Verificar que `window.addEventListener('load', init)` está comentado.
- [ ] **platformGuardian.js**: Verificar que importa `init` de `app.js`.
- [ ] **bootstrap.js**: Verificar que `initGuardian()` se llama al final de la cadena de promesas.
