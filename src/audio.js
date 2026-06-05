class AudioSynth {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.isEnabled = false;
        
        // Music loop scheduling variables
        this.musicIntervalId = null;
        this.currentChordIndex = 0;
        this.chords = [
            // C minor, Eb major, G minor, F major (Epic synth feel)
            { root: 130.81, pad: [261.63, 311.13, 392.00] }, // Cm (C3, C4, Eb4, G4)
            { root: 155.56, pad: [311.13, 392.00, 466.16] }, // Eb (Eb3, Eb4, G4, Bb4)
            { root: 98.00,  pad: [196.00, 233.08, 293.66] }, // Gm (G2, G3, Bb3, D4)
            { root: 174.61, pad: [349.23, 440.00, 523.25] }  // F  (F3, F4, A4, C5)
        ];
        this.musicStep = 0;
    }

    init() {
        if (this.ctx) return;
        
        // Handle browser compatibility
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // Create gains
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // start quiet
        this.masterGain.connect(this.ctx.destination);
        
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(0.3, this.ctx.currentTime); // moderate music
        this.musicGain.connect(this.masterGain);
        
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.6, this.ctx.currentTime); // crisp SFX
        this.sfxGain.connect(this.masterGain);
    }

    toggle() {
        this.init();
        
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.isEnabled = !this.isEnabled;
        
        if (this.isEnabled) {
            // Fade in master volume
            this.masterGain.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + 0.3);
            this.startMusic();
        } else {
            // Fade out master volume
            this.masterGain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.2);
            // Wait for fade out to stop scheduling music
            setTimeout(() => {
                if (!this.isEnabled) this.stopMusic();
            }, 200);
        }
        
        return this.isEnabled;
    }

    // --- SFX GENERATORS ---

    playLaser() {
        if (!this.isEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Laser oscillator (descending frequency sweep)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        
        // Highpass filter to make it sound laser-sharp and sci-fi
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(200, now);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playExplosion() {
        if (!this.isEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        const duration = 0.6;
        
        // Generate white noise buffer
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        // Bandpass filter to sculpt the noise into an explosion
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + duration);
        filter.Q.setValueAtTime(4.0, now);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        
        // Sub-bass thump for the explosion impact
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(120, now);
        subOsc.frequency.linearRampToValueAtTime(40, now + 0.25);
        
        subGain.gain.setValueAtTime(0.6, now);
        subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        
        // Connections
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        
        noise.start(now);
        noise.stop(now + duration);
        subOsc.start(now);
        subOsc.stop(now + 0.25);
    }

    playHit() {
        if (!this.isEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Short, metallic sci-fi ding for hit confirmation
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.05);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.start(now);
        osc.stop(now + 0.05);
    }

    playHurt() {
        if (!this.isEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Harsh buzzer sound indicating player integrity damage
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(150, now);
        osc1.frequency.linearRampToValueAtTime(80, now + 0.2);
        
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(153, now); // Detuned
        osc2.frequency.linearRampToValueAtTime(81, now + 0.2);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        osc1.start(now);
        osc1.stop(now + 0.2);
        osc2.start(now);
        osc2.stop(now + 0.2);
    }

    playPickup() {
        if (!this.isEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        // Upward synth arpeggio for power-ups
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C major arpeggio
        notes.forEach((freq, idx) => {
            const time = now + idx * 0.06;
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            
            gain.gain.setValueAtTime(0.12, time);
            gain.gain.exponentialRampToValueAtTime(0.005, time + 0.15);
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.start(time);
            osc.stop(time + 0.15);
        });
    }

    // --- GENERATIVE MUSIC SYSTEM ---

    startMusic() {
        if (this.musicIntervalId) return;
        
        this.musicStep = 0;
        this.currentChordIndex = 0;
        
        // Loop runs every 200ms to schedule beats and chords dynamically
        this.musicIntervalId = setInterval(() => {
            this.tickMusic();
        }, 200);
    }

    stopMusic() {
        if (this.musicIntervalId) {
            clearInterval(this.musicIntervalId);
            this.musicIntervalId = null;
        }
    }

    tickMusic() {
        if (!this.isEnabled || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        const chord = this.chords[this.currentChordIndex];
        
        // 1. Play heavy bass line pulse on step 0, 4, 8, 12 (beat starts, every 0.8s)
        if (this.musicStep % 4 === 0) {
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            
            bassOsc.type = 'triangle';
            // Play root frequency detuned down one octave (root / 2)
            bassOsc.frequency.setValueAtTime(chord.root / 2, now);
            
            bassGain.gain.setValueAtTime(0.25, now);
            bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
            
            const lowpass = this.ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.setValueAtTime(200, now);
            
            bassOsc.connect(lowpass);
            lowpass.connect(bassGain);
            bassGain.connect(this.musicGain);
            
            bassOsc.start(now);
            bassOsc.stop(now + 0.6);
        }
        
        // 2. Play ambient pad chords on step 0 (every 3.2s)
        if (this.musicStep === 0) {
            chord.pad.forEach((freq) => {
                const padOsc = this.ctx.createOscillator();
                const padGain = this.ctx.createGain();
                
                padOsc.type = 'sine';
                padOsc.frequency.setValueAtTime(freq, now);
                
                // Slow attack, long release pad
                padGain.gain.setValueAtTime(0.0, now);
                padGain.gain.linearRampToValueAtTime(0.06, now + 0.8); // 0.8s attack
                padGain.gain.setValueAtTime(0.06, now + 2.4); // hold
                padGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2); // 0.8s decay
                
                const bandpass = this.ctx.createBiquadFilter();
                bandpass.type = 'bandpass';
                bandpass.frequency.setValueAtTime(freq, now);
                bandpass.Q.setValueAtTime(10, now);
                
                padOsc.connect(bandpass);
                bandpass.connect(padGain);
                padGain.connect(this.musicGain);
                
                padOsc.start(now);
                padOsc.stop(now + 3.2);
            });
        }
        
        // 3. Play a little high-pitch cyber beep occasionally for melody (steps 6, 10, 14)
        if (this.musicStep === 6 || this.musicStep === 10 || this.musicStep === 14) {
            // Pick a note from the chord pad octave up
            const noteIdx = Math.floor(Math.random() * chord.pad.length);
            const freq = chord.pad[noteIdx] * 2; // Octave up
            
            const beepOsc = this.ctx.createOscillator();
            const beepGain = this.ctx.createGain();
            const delay = this.ctx.createDelay();
            const feedback = this.ctx.createGain();
            
            beepOsc.type = 'sine';
            beepOsc.frequency.setValueAtTime(freq, now);
            
            beepGain.gain.setValueAtTime(0.02, now);
            beepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            
            // Connect direct
            beepOsc.connect(beepGain);
            beepGain.connect(this.musicGain);
            
            beepOsc.start(now);
            beepOsc.stop(now + 0.2);
        }

        // Increment steps
        this.musicStep = (this.musicStep + 1) % 16; // 16 steps total = 3.2 seconds
        
        // If we finished a 16-step bar, advance the chord progression
        if (this.musicStep === 0) {
            this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;
        }
    }
}

// Export a single instance
export const audio = new AudioSynth();
export default audio;
