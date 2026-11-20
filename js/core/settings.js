const KEY = 'mekanik_settings_v1';

export const defaults = {
  quality: 'high',
  resolutionScale: 1,
  shadows: true,
  renderDistance: 600,
  vegetationDensity: .75,
  antialias: true,
  visualEffects: true,
  fpsCap: 0,
  volumeMaster: .8, volumeMusic: .5, volumeSfx: .8, volumeAmb: .8, soundVehicles: true, soundAmbient: true,
  mouseSensitivity: 1, invertY: false,
  bindings: null,
  showTutorials: true, showIndicators: true, buildSpeed: 1, physicsDamage: true, buildLimits: true,
  camera: 'third', camDistance: 9, camSmooth: 1, camSensitivity: 1,
};

export const settings = {
  data: { ...defaults },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...defaults, ...JSON.parse(raw) };
    } catch { /* primera ejecución */ }
    return this.data;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* almacenamiento lleno */ }
  },
};

settings.load();
