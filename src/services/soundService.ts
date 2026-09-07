// Sound Service using Web Audio API (Universal zero-dependency synthesized audio alerts)

class SoundService {
  private audioCtx: AudioContext | null = null;

  private triggerVibration(pattern: number[]) {
    try {
      const { Vibration } = require('react-native');
      if (Vibration && typeof Vibration.vibrate === 'function') {
        Vibration.vibrate(pattern);
      }
    } catch (e) {}
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch (e) {}
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // Sonido de Nueva Comanda a Cocina (Campana suave y profunda)
  playNewOrderSound() {
    this.triggerVibration([0, 500, 200, 500]);
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  // Sonido de Comanda Lista en Mesero & Caja (Doble tono alegre de aviso)
  playOrderReadySound() {
    this.triggerVibration([0, 250, 100, 250]);
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const playNote = (freq: number, delay: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.4);
      };

      playNote(659.25, 0);   // E5
      playNote(987.77, 0.15); // B5
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  // Sonido de Comanda Cancelada / Eliminada (Silenciado a petición del cliente)
  playOrderCancelledSound() {
    // Silenciado intencionalmente sin emitir sonido ni vibración
  }

  // Sonido de Comanda Editada / Corregida (Silenciado a petición del cliente)
  playOrderEditedSound() {
    // Silenciado intencionalmente sin emitir sonido ni vibración
  }
}

export const soundService = new SoundService();

