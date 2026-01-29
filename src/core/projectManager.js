
const DB_NAME = 'DTFStudioProDB';
const DB_VERSION = 2;
const STORE_NAME = 'projects';
const BLOBS_STORE = 'blobs';

class ProjectStorage {
  constructor() {
    this.db = null;
    this.ready = this.initDB();
  }

  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        reject(event.target.error);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(BLOBS_STORE)) {
          db.createObjectStore(BLOBS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };
    });
  }

  async getAll() {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort by updatedAt descending
        const projects = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(projects);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async save(project) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(project);

      request.onsuccess = () => resolve(project.id);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveBlob(id, blob) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([BLOBS_STORE], 'readwrite');
      const store = transaction.objectStore(BLOBS_STORE);
      // Guardamos un objeto simple o el blob directo? Mejor objeto para metadatos futuros
      const request = store.put({ id, blob, createdAt: Date.now() });

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getBlob(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([BLOBS_STORE], 'readonly');
      const store = transaction.objectStore(BLOBS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBlob(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([BLOBS_STORE], 'readwrite');
      const store = transaction.objectStore(BLOBS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const storage = new ProjectStorage();

// Current active project metadata
let currentProject = null;
let autosaveTimer = null;
let isSaving = false;

// Callbacks for UI updates
let onStatusChange = null;

export const projectManager = {
  async init() {
    // Check if we can restore the last session
    // For now, we just ensure DB is ready
    await storage.ready;
    return true;
  },

  setCallbacks({ onStatus }) {
    onStatusChange = onStatus;
  },

  getCurrentProject() {
    return currentProject;
  },

  async listProjects() {
    return await storage.getAll();
  },

  async createProject(name = 'Nuevo Proyecto') {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    currentProject = {
      id,
      name,
      version: '1.0',
      createdAt: now,
      updatedAt: now,
      // Data will be populated on save
      data: null 
    };
    
    // Not saving immediately to DB until content is added or user explicitly saves? 
    // Requirements say "Crear proyecto". Let's save the skeleton.
    // But we need the current state.
    // Ideally, createProject just resets the current state and sets the metadata.
    
    this._notifyStatus('Proyecto creado');
    return currentProject;
  },

  async loadProject(id, callbacks) {
    try {
      this._notifyStatus('Cargando...', 'loading');
      const project = await storage.get(id);
      if (!project) throw new Error('Proyecto no encontrado');

      currentProject = project;
      
      // Call external handlers to restore state
      if (callbacks && callbacks.onLoad) {
        await callbacks.onLoad(project.data);
      }
      
      this._notifyStatus('Proyecto cargado', 'success');
      return project;
    } catch (err) {
      console.error(err);
      this._notifyStatus('Error al cargar', 'error');
      throw err;
    }
  },

  async saveProject(getDataFn) {
    if (!currentProject) {
      await this.createProject();
    }

    try {
      isSaving = true;
      this._notifyStatus('Guardando...', 'saving');

      const data = await getDataFn(); // Get current state from app
      
      currentProject.data = data;
      currentProject.updatedAt = Date.now();

      await storage.save(currentProject);
      
      isSaving = false;
      this._notifyStatus('Guardado', 'saved');
      return currentProject;
    } catch (err) {
      isSaving = false;
      console.error(err);
      this._notifyStatus('Error al guardar', 'error');
      throw err;
    }
  },

  async deleteProject(id) {
    await storage.delete(id);
    if (currentProject && currentProject.id === id) {
      currentProject = null;
    }
    return true;
  },

  async duplicateProject(id) {
    const original = await storage.get(id);
    if (!original) throw new Error('Proyecto no encontrado');

    const newProject = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (Copia)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await storage.save(newProject);
    return newProject;
  },

  // Autosave Logic
  initAutoSave(getDataFn, intervalMs = 15000) {
    if (autosaveTimer) clearInterval(autosaveTimer);

    autosaveTimer = setInterval(async () => {
      if (!currentProject || isSaving) return;
      
      // Simple check: In a real app we might check dirty flags.
      // For now, we just save periodically if a project is active.
      // We can implement a "dirty" check later if performance is an issue.
      
      // To avoid blocking, we can check if tab is visible or use requestIdleCallback logic if needed.
      // But IndexedDB is async, so it shouldn't block main thread too much.
      
      await this.saveProject(getDataFn).catch(e => console.warn('Autosave failed', e));
      
    }, intervalMs);
  },

  stopAutoSave() {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = null;
  },

  // --- Blob Management Exposed ---
  async saveBlob(id, blob) {
    return await storage.saveBlob(id, blob);
  },
  
  async getBlob(id) {
    return await storage.getBlob(id);
  },

  async deleteBlob(id) {
    return await storage.deleteBlob(id);
  },

  _notifyStatus(msg, type = 'info') {
    if (onStatusChange) onStatusChange({ message: msg, type });
  }
};
