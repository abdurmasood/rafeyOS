// ---------------------------------------------------------------------------
// Reverb — algorithmic via noise-buffer impulse response
// ---------------------------------------------------------------------------

/**
 * Create a reverb effect using a generated impulse response.
 * No external audio files needed — the IR is synthesized from shaped noise.
 */
export function createReverb(ctx, options = {}) {
  const { duration = 1.5, decay = 2.0, mix = 0.3 } = options;

  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay);
    }
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - mix;

  const wetGain = ctx.createGain();
  wetGain.gain.value = mix;

  const merger = ctx.createGain();

  // input splits to dry and wet paths
  const input = ctx.createGain();
  input.connect(dryGain);
  input.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(merger);
  wetGain.connect(merger);

  return { input, output: merger };
}

// ---------------------------------------------------------------------------
// Delay — feedback delay with filter
// ---------------------------------------------------------------------------

/**
 * Create a feedback delay with a filter in the feedback loop.
 * The filter darkens each repeat, mimicking analog tape delay.
 */
export function createDelay(ctx, options = {}) {
  const { time = 0.12, feedback = 0.25, filterFreq = 3000, mix = 0.25 } = options;

  const delayNode = ctx.createDelay(Math.max(time, 1.0));
  delayNode.delayTime.value = time;

  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = Math.min(feedback, 0.95);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - mix;

  const wetGain = ctx.createGain();
  wetGain.gain.value = mix;

  const merger = ctx.createGain();

  const input = ctx.createGain();
  input.connect(dryGain);
  input.connect(delayNode);
  delayNode.connect(filter);
  filter.connect(feedbackGain);
  feedbackGain.connect(delayNode);
  filter.connect(wetGain);
  dryGain.connect(merger);
  wetGain.connect(merger);

  return { input, output: merger };
}

// ---------------------------------------------------------------------------
// Chorus — detuned copy with LFO modulation
// ---------------------------------------------------------------------------

/**
 * Create a chorus effect using a modulated delay line.
 * Adds width and shimmer via slight pitch variation.
 */
export function createChorus(ctx, options = {}) {
  const { rate = 1.5, depth = 2, detune = 15, mix = 0.3 } = options;

  const delayNode = ctx.createDelay(0.05);
  delayNode.delayTime.value = depth / 1000;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = rate;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = depth / 2000;

  lfo.connect(lfoGain);
  lfoGain.connect(delayNode.delayTime);

  const detuneNode = ctx.createOscillator();
  detuneNode.type = "sine";
  detuneNode.frequency.value = rate * 0.7;
  detuneNode.detune.value = detune;
  // DetuneNode is a modulation source only — no audio output needed
  detuneNode.start();

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - mix;

  const wetGain = ctx.createGain();
  wetGain.gain.value = mix;

  const merger = ctx.createGain();

  const input = ctx.createGain();
  input.connect(dryGain);
  input.connect(delayNode);
  delayNode.connect(wetGain);
  dryGain.connect(merger);
  wetGain.connect(merger);

  lfo.start();

  return { input, output: merger };
}

// ---------------------------------------------------------------------------
// Distortion — waveshaper saturation
// ---------------------------------------------------------------------------

/**
 * Create a distortion effect using a waveshaper curve.
 * Adds harmonic saturation for grit and warmth.
 */
export function createDistortion(ctx, options = {}) {
  const { amount = 0.4, filterFreq = 3000, mix = 0.5 } = options;

  const shaper = ctx.createWaveShaper();
  const curve = makeDistortionCurve(amount);
  shaper.curve = curve;
  shaper.oversample = "2x";

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.7;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - mix;

  const wetGain = ctx.createGain();
  wetGain.gain.value = mix;

  const merger = ctx.createGain();

  const input = ctx.createGain();
  input.connect(dryGain);
  input.connect(shaper);
  shaper.connect(filter);
  filter.connect(wetGain);
  dryGain.connect(merger);
  wetGain.connect(merger);

  return { input, output: merger };
}

// ---------------------------------------------------------------------------
// Curve generation
// ---------------------------------------------------------------------------

function makeDistortionCurve(amount) {
  const k = amount * 100;
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Build an effects chain from an array of effect definitions.
 * Returns the first input node and the last output node.
 *
 * Usage:
 *   const chain = buildEffectsChain(ctx, [{ type: "reverb" }, { type: "delay" }]);
 *   source.connect(chain.input);
 *   chain.output.connect(ctx.destination);
 */
export function buildEffectsChain(ctx, effects) {
  if (effects.length === 0) {
    const passthrough = ctx.createGain();
    return { input: passthrough, output: passthrough };
  }

  const nodes = effects.map((def) => {
    switch (def.type) {
      case "reverb":
        return createReverb(ctx, def.options);
      case "delay":
        return createDelay(ctx, def.options);
      case "chorus":
        return createChorus(ctx, def.options);
      case "distortion":
        return createDistortion(ctx, def.options);
    }
  });

  // Daisy-chain: output of [i] → input of [i+1]
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].output.connect(nodes[i + 1].input);
  }

  return { input: nodes[0].input, output: nodes[nodes.length - 1].output };
}
