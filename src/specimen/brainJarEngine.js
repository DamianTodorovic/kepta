import * as THREE from 'three';

/**
 * Shared 3D domain-warped cortical gyri/sulci height field with anatomical Sylvian & Central sulci.
 * Returns h in [0, 1]: 0.0 = sharp sulcus valley, 1.0 = plump rounded gyrus crest.
 */
function corticalHeightJS(x, y, z, side) {
  const sylvY = -0.10 + 0.26 * x;
  const isTemp = Math.exp(-Math.pow((x - 0.14) / 0.56, 2)) * (y < sylvY ? 1.0 : Math.exp(-Math.pow((y - sylvY) / 0.11, 2)));
  const isCent = Math.exp(-Math.pow((x + 0.05 + 0.20 * y) / 0.18, 2));

  // Smoother, plumper anatomical gyri scale with serpentine organic flow
  const sx = (x + side * 0.22) * (11.6 * (1.0 - 0.20 * isTemp));
  const sy = y * (11.6 * (1.0 - 0.15 * isCent));
  const sz = z * 11.6;

  const w1x = Math.sin(sy * 1.08 + Math.cos(sz * 0.90 + 0.7)) * 0.45;
  const w1y = Math.sin(sz * 1.14 - Math.cos(sx * 0.84 + 1.4)) * 0.45;
  const w1z = Math.sin(sx * 1.02 + Math.cos(sy * 0.92 + 2.1)) * 0.45;

  const qx = sx + w1x;
  const qy = sy + w1y;
  const qz = sz + w1z;

  const w2x = Math.cos(qz * 1.24 + Math.sin(qx * 1.02));
  const w2y = Math.cos(qx * 1.30 - Math.sin(qy * 1.08));
  const w2z = Math.cos(qy * 1.18 + Math.sin(qz * 1.05));

  const rx = qx + w2x * 0.21;
  const ry = qy + w2y * 0.21;
  const rz = qz + w2z * 0.21;

  const gyroid =
    Math.sin(rx) * Math.cos(ry) +
    Math.sin(ry) * Math.cos(rz) +
    Math.sin(rz) * Math.cos(rx);
  const sub =
    Math.sin(rx * 1.35 + rz * 0.65) * Math.cos(ry * 1.32 - rx * 0.52) * 0.065;
  const f = (gyroid + sub) * 0.68;

  // Parabolic-sine convex dome matching GLSL corticalHeight()
  const af = Math.abs(f);
  const u = Math.min(1.0, Math.max(0.0, af / (0.76 + 0.36 * af)));
  let h = Math.sin(u * Math.PI * 0.5);

  // Anatomical landmarks matching GLSL smooth dips
  const sylvianY = -0.10 + 0.26 * x + Math.sin(x * 6.5) * 0.018;
  const sylvianXMask = Math.exp(-Math.pow((x - 0.12) / 0.42, 2));
  const sylvianDist = Math.abs(y - sylvianY);
  const sylvianCleft = 1.0 - 0.82 * Math.exp(-Math.pow(sylvianDist / 0.036, 2)) * sylvianXMask;

  const centralX = -0.05 - 0.20 * y + Math.sin(y * 7.5) * 0.018;
  const centralYMask = y > -0.02 ? 1.0 : Math.exp(-Math.pow((y + 0.02) / 0.14, 2));
  const centralDist = Math.abs(x - centralX);
  const centralCleft = 1.0 - 0.62 * Math.exp(-Math.pow(centralDist / 0.036, 2)) * centralYMask;

  h *= Math.min(sylvianCleft, centralCleft);
  return h;
}

/**
 * Builds one anatomical cerebral hemisphere (side = -1 left, +1 right) using real human L:W:H proportions
 * (~1.77 : 1.44 : 1.00), narrow frontal pole, concave orbital notch, protruding temporal pole & occipital tentorium.
 */
function buildHemisphere(side) {
  const geo = new THREE.IcosahedronGeometry(1, 6);
  const pos = geo.attributes.position;
  const partAttr = new Float32Array(pos.count);
  const coordAttr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Flatten medial wall along longitudinal fissure while preserving slight rounded margin
    if (v.z * side < 0) {
      v.z *= 0.075;
    }

    // Real adult human cerebrum macro proportions (L:W:H ≈ 1.77 : 1.44 : 1.00)
    v.x *= 1.22;
    v.y *= 0.80;
    v.z *= 0.96;

    // Narrower frontal pole (+X) & wider rounded parietal-occipital dome (-X)
    if (v.x > -0.15) {
      const fn = (v.x + 0.15) / 1.37;
      v.z *= 1.0 - 0.27 * Math.pow(fn, 1.55);
      v.y -= 0.13 * Math.pow(Math.max(0, v.x) / 1.22, 1.85);
    }
    // Parietal lateral fullness
    const parBroad = Math.exp(-Math.pow((v.x + 0.22) / 0.48, 2));
    v.z *= 1.0 + 0.055 * parBroad;

    // Subtle human cerebral petalia asymmetry (right slightly anterior, left slightly posterior)
    v.x += side > 0 ? 0.020 : -0.020;

    // Soft organic medial lip roll so hemispheres curve into the longitudinal fissure rather than razor edges
    if (Math.abs(v.z) < 0.14 && v.y > 0) {
      v.y -= (1.0 - Math.abs(v.z) / 0.14) * 0.026;
    }

    const latMask = Math.min(1.0, Math.abs(v.z) * 1.45);

    // Concave Frontal Orbital Floor & fronto-temporal stem notch
    if (v.y < 0) {
      const orbT = Math.max(0, -v.y / 0.80);
      const orbMask = Math.exp(-Math.pow((v.x - 0.78) / 0.38, 2)) * Math.pow(orbT, 1.15);
      v.y += orbMask * 0.34;
      // Medial interpeduncular fossa recess clearing space for prominent anterior Pons belly
      const fossaMask = Math.exp(-Math.pow(v.z / 0.22, 2)) * Math.exp(-Math.pow((v.x + 0.12) / 0.42, 2)) * orbT;
      v.y += fossaMask * 0.18;
    }

    // Protruding Temporal Lobe & distinct anterior Temporal Pole thumb (keeps medial inferior fossa clear for Pons)
    const temporalMask =
      Math.exp(-Math.pow((v.x - 0.22) / 0.41, 2)) *
      Math.exp(-Math.pow((v.y + 0.27) / 0.29, 2)) *
      latMask;
    v.y -= temporalMask * 0.118;
    v.z += side * temporalMask * 0.115;

    // Deep Oblique Sylvian Fissure trough above temporal lobe
    const sylvianY = -0.10 + 0.26 * v.x + Math.sin(v.x * 6.5) * 0.016;
    const sylvianMask =
      Math.exp(-Math.pow((v.x - 0.12) / 0.44, 2)) *
      Math.exp(-Math.pow((v.y - sylvianY) / 0.076, 2)) *
      latMask;
    v.z -= side * sylvianMask * 0.125;

    // Posterior Tentorial Shelf under Occipital Lobes (creates snug cranial pocket for Cerebellum)
    if (v.x < -0.12 && v.y < 0) {
      const tentX = Math.max(0, (-v.x - 0.12) / 1.10);
      const tentY = Math.max(0, -v.y / 0.80);
      v.y += Math.pow(tentX, 1.25) * Math.pow(tentY, 1.15) * 0.34;
    }

    coordAttr[i * 3] = v.x;
    coordAttr[i * 3 + 1] = v.y;
    coordAttr[i * 3 + 2] = v.z;

    pos.setXYZ(i, v.x, v.y, v.z);
    partAttr[i] = 0.0;
  }

  // Smooth pre-displacement normals anchored for C2 fragment shading (zero polygon faceting!)
  geo.computeVertexNormals();
  const smoothNormAttr = new Float32Array(geo.attributes.normal.array);

  for (let i = 0; i < pos.count; i++) {
    const cx = coordAttr[i * 3];
    const cy = coordAttr[i * 3 + 1];
    const cz = coordAttr[i * 3 + 2];
    const medialFade = Math.min(1.0, Math.abs(cz) * 5.2);
    const h = corticalHeightJS(cx, cy, cz, side);
    const disp = (h - 0.38) * 0.028 * medialFade;
    dir.set(cx, cy, cz).normalize();
    pos.setXYZ(
      i,
      cx + dir.x * disp,
      cy + dir.y * disp,
      cz + dir.z * disp + side * 0.020
    );
  }

  geo.setAttribute('aPart', new THREE.BufferAttribute(partAttr, 1));
  geo.setAttribute('aBrainCoord', new THREE.BufferAttribute(coordAttr, 3));
  geo.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothNormAttr, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the bulbous butterfly-shaped Cerebellum (~68% cerebral width) with twin inferior bellies & tentorial slope.
 */
function buildCerebellum() {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position;
  const partAttr = new Float32Array(pos.count);
  const coordAttr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Fuller anatomical cerebellar proportions (width ~1.36, height ~0.74, AP ~0.88)
    v.x *= 0.44;
    v.y *= 0.37;
    v.z *= 0.68;

    // Twin bulbous lateral hemispheres + recessed central vermis cleft & inferior vallecula
    const vermis = Math.exp(-Math.pow(v.z / 0.14, 2));
    v.x += vermis * 0.055;
    v.y *= 1.0 - 0.10 * vermis;
    if (v.y < 0) {
      v.y += Math.exp(-Math.pow(v.z / 0.15, 2)) * 0.048;
      // Lateral belly drop so posterior-inferior cerebellar hemispheres bracket brainstem cleanly
      const bellyMask = Math.exp(-Math.pow((Math.abs(v.z) - 0.36) / 0.22, 2));
      v.y -= bellyMask * 0.035;
    }

    // Anterior brainstem fossa notch (+X side cradles 4th ventricle & Pons)
    if (v.x > 0) {
      const antNotch = Math.exp(-Math.pow(v.z / 0.22, 2)) * (v.x / 0.44);
      v.x -= antNotch * 0.115;
    }

    // Gentle superior tentorial slope (preserves bulbous volume!)
    if (v.y > 0) {
      const slopeFrac = Math.max(0, 0.24 - v.x * 0.42);
      v.y *= 1.0 - Math.min(0.16, slopeFrac * 0.25);
    }

    pos.setXYZ(i, v.x, v.y, v.z);
    coordAttr[i * 3] = v.x;
    coordAttr[i * 3 + 1] = v.y;
    coordAttr[i * 3 + 2] = v.z;
    partAttr[i] = 1.0;
  }

  geo.computeVertexNormals();
  const smoothNormAttr = new Float32Array(geo.attributes.normal.array);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Gentle sub-Nyquist cerebellar lobule contours (prevents triangle-grid zone-plate bullseyes on lateral bellies)
    const foliaAngle = Math.atan2(v.y - 0.02, 0.56 - v.x);
    const folia = Math.sin(foliaAngle * 14.0 * Math.PI + Math.cos(v.z * 4.5) * 0.22);
    v.addScaledVector(v.clone().normalize(), folia * 0.0014);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.setAttribute('aPart', new THREE.BufferAttribute(partAttr, 1));
  geo.setAttribute('aBrainCoord', new THREE.BufferAttribute(coordAttr, 3));
  geo.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothNormAttr, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an unmistakable anatomical Midbrain -> Ventral Pons Belly -> ~110-deg Medulla Oblongata brainstem.
 */
function buildBrainstem() {
  const heightSegs = 52;
  const capSegs = 5;
  const totalRows = heightSegs + capSegs;
  const radialSegs = 44;
  const positions = [];
  const partAttr = [];
  const coordAttr = [];
  const indices = [];

  const radiusAt = (t) => {
    const ponsBulge = Math.exp(-Math.pow((t - 0.48) / 0.145, 2));
    const topFlare = Math.exp(-Math.pow(t / 0.16, 2));
    const oliveBulge = Math.exp(-Math.pow((t - 0.78) / 0.10, 2));
    let r = t > 0.64
      ? 0.104 - 0.026 * Math.pow((t - 0.64) / 0.36, 0.85) + oliveBulge * 0.015
      : 0.114 + ponsBulge * 0.074 + topFlare * 0.026;
    const pmPinch = Math.exp(-Math.pow((t - 0.64) / 0.042, 2));
    r *= 1.0 - pmPinch * 0.14;
    if (t > 0.90) {
      const endT = (t - 0.90) / 0.10;
      r *= 1.0 - 0.10 * endT * endT;
    }
    return { r, ponsBulge, oliveBulge };
  };

  const centerXAt = (t) => 0.12 - t * 0.08 - Math.pow(Math.max(0, t - 0.50), 1.28) * 0.30;

  for (let i = 0; i <= totalRows; i++) {
    let t = Math.min(1.0, i / heightSegs);
    let y = 0.48 - t * 0.88;
    let capScale = 1.0;

    if (i > heightSegs) {
      const capFrac = (i - heightSegs) / (capSegs + 0.35);
      const phi = capFrac * (Math.PI * 0.44);
      capScale = Math.cos(phi);
      y = -0.40 - Math.sin(phi) * 0.056;
      t = 1.0;
    }

    const { r, ponsBulge, oliveBulge } = radiusAt(t);
    const centerX = centerXAt(t);
    const isMedulla = t > 0.62 ? 1.0 : 0.0;

    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Sculpted anterior Pons belly (+X), twin medullary pyramids, basilar groove & posterior middle cerebellar peduncles
      const antPons = Math.max(0, cosT) * ponsBulge * 0.160 * capScale;
      const postPeduncle = Math.max(0, -cosT) * Math.sin(theta) * Math.sin(theta) * ponsBulge * 0.095 * capScale;
      const pyramids = Math.max(0, cosT) * Math.abs(Math.sin(theta * 2.0)) * 0.015 * isMedulla * capScale;
      const olivePair = Math.exp(-Math.pow((Math.abs(sinT) - 0.72) / 0.28, 2)) * Math.max(0, cosT + 0.3) * oliveBulge * 0.014 * capScale;
      const basilarGroove = Math.pow(Math.max(0, cosT), 8.0) * (ponsBulge * 0.020 + isMedulla * 0.011) * capScale;

      const rx = r * capScale * (1.0 + 0.06 * sinT * sinT);
      const rz = r * capScale * 1.12;
      const vx = centerX + cosT * rx + antPons - postPeduncle + pyramids - basilarGroove;
      const vz = sinT * rz + Math.sign(sinT) * olivePair;

      positions.push(vx, y, vz);
      coordAttr.push(vx, y, vz);
      partAttr.push(0.55);
    }
  }

  // Watertight OUTWARD CCW winding: cross(b - a, c - a) points radially outward on walls and downward on bottom cap
  const stride = radialSegs + 1;
  for (let i = 0; i < totalRows; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  // Close top midbrain ring upward (+Y)
  const topCenterIdx = positions.length / 3;
  const topCenterX = centerXAt(0);
  positions.push(topCenterX, 0.50, 0);
  coordAttr.push(topCenterX, 0.50, 0);
  partAttr.push(0.55);
  for (let j = 0; j < radialSegs; j++) {
    indices.push(topCenterIdx, j + 1, j);
  }

  // Close domed medullary tip downward (-Y)
  const bottomCenterIdx = positions.length / 3;
  const lastRowOffset = totalRows * stride;
  const endCenterX = centerXAt(1.0);
  positions.push(endCenterX, -0.456, 0);
  coordAttr.push(endCenterX, -0.456, 0);
  partAttr.push(0.55);
  for (let j = 0; j < radialSegs; j++) {
    indices.push(lastRowOffset + j, lastRowOffset + j + 1, bottomCenterIdx);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const smoothNormAttr = new Float32Array(geo.attributes.normal.array);

  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(partAttr, 1));
  geo.setAttribute('aBrainCoord', new THREE.Float32BufferAttribute(coordAttr, 3));
  geo.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothNormAttr, 3));
  return geo;
}

/**
 * High-detail 3D Sculpted Gyri + Analytical Normal Perturbation + Multi-Tone Engraving Brain Shader.
 */
function createBrainInkMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFillColor: { value: new THREE.Color('#ffffff') },
      uLineColor: { value: new THREE.Color('#111113') },
      uLightDir: { value: new THREE.Vector3(0.55, 0.72, 0.52).normalize() },
      uIsLightMode: { value: 0.0 },
      uCompact: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec3 aBrainCoord;
      attribute vec3 aSmoothNormal;

      varying vec3 vNormalView;
      varying vec3 vSmoothNormalView;
      varying vec3 vObjNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vBrainCoord;
      varying float vPart;
      varying vec3 vNm0;
      varying vec3 vNm1;
      varying vec3 vNm2;

      void main() {
        vPart = aPart;
        vLocalPos = position;
        vBrainCoord = aBrainCoord;
        vObjNormal = normalize(aSmoothNormal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        vSmoothNormalView = normalize(normalMatrix * aSmoothNormal);
        vNm0 = normalMatrix[0];
        vNm1 = normalMatrix[1];
        vNm2 = normalMatrix[2];
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFillColor;
      uniform vec3 uLineColor;
      uniform vec3 uLightDir;
      uniform float uIsLightMode;
      uniform float uCompact;

      varying vec3 vNormalView;
      varying vec3 vSmoothNormalView;
      varying vec3 vObjNormal;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vBrainCoord;
      varying float vPart;
      varying vec3 vNm0;
      varying vec3 vNm1;
      varying vec3 vNm2;

      // Exact GLSL counterpart of corticalHeightJS() with smooth serpentine gyri & anatomical clefts
      float corticalHeight(vec3 p) {
        float sideSign = p.z >= 0.0 ? 1.0 : -1.0;
        float sylvY = -0.10 + 0.26 * p.x;
        float isTemp = exp(-pow((p.x - 0.14) / 0.56, 2.0)) * (p.y < sylvY ? 1.0 : exp(-pow((p.y - sylvY) / 0.11, 2.0)));
        float isCent = exp(-pow((p.x + 0.05 + 0.20 * p.y) / 0.18, 2.0));

        vec3 s = (p + vec3(sideSign * 0.22, 0.0, 0.0)) * vec3(11.6 * (1.0 - 0.20 * isTemp), 11.6 * (1.0 - 0.15 * isCent), 11.6);
        vec3 w1 = vec3(
          sin(s.y * 1.08 + cos(s.z * 0.90 + 0.7)) * 0.45,
          sin(s.z * 1.14 - cos(s.x * 0.84 + 1.4)) * 0.45,
          sin(s.x * 1.02 + cos(s.y * 0.92 + 2.1)) * 0.45
        );
        vec3 q = s + w1;
        vec3 w2 = vec3(
          cos(q.z * 1.24 + sin(q.x * 1.02)),
          cos(q.x * 1.30 - sin(q.y * 1.08)),
          cos(q.y * 1.18 + sin(q.z * 1.05))
        );
        vec3 r = q + w2 * 0.21;
        float gyroid = sin(r.x) * cos(r.y) + sin(r.y) * cos(r.z) + sin(r.z) * cos(r.x);
        float sub = sin(r.x * 1.35 + r.z * 0.65) * cos(r.y * 1.32 - r.x * 0.52) * 0.065;
        float f = (gyroid + sub) * 0.68;

        // True curved parabolic-sine dome (continuous curvature across every gyrus crest — zero flat mesa!)
        float af = abs(f);
        float u = clamp(af / (0.76 + 0.36 * af), 0.0, 1.0);
        float h = sin(u * 1.5707963);

        // Crisp anatomical cleft dips carved smoothly into cortical field (zero flat puddle trench!)
        float sylvianY = -0.10 + 0.26 * p.x + sin(p.x * 6.5) * 0.018;
        float sylvianXMask = exp(-pow((p.x - 0.12) / 0.42, 2.0));
        float sylvianCleft = 1.0 - 0.82 * exp(-pow((p.y - sylvianY) / 0.036, 2.0)) * sylvianXMask;

        float centralX = -0.05 - 0.20 * p.y + sin(p.y * 7.5) * 0.018;
        float centralYMask = p.y > -0.02 ? 1.0 : exp(-pow((p.y + 0.02) / 0.14, 2.0));
        float centralCleft = 1.0 - 0.62 * exp(-pow((p.x - centralX) / 0.036, 2.0)) * centralYMask;

        return h * min(sylvianCleft, centralCleft);
      }

      // Returns xyz = C2 perturbed normal, w = true upwind gradient-normalized sulcus SDF distance (zero triangle blobs!)
      vec4 computeGyrusInfo(vec3 baseN, vec3 p, float strength) {
        float eps = 0.004;
        float h0 = corticalHeight(p);
        float hpx = corticalHeight(p + vec3(eps, 0.0, 0.0));
        float hmx = corticalHeight(p - vec3(eps, 0.0, 0.0));
        float hpy = corticalHeight(p + vec3(0.0, eps, 0.0));
        float hmy = corticalHeight(p - vec3(0.0, eps, 0.0));
        float hpz = corticalHeight(p + vec3(0.0, 0.0, eps));
        float hmz = corticalHeight(p - vec3(0.0, 0.0, eps));

        vec3 gradObj = vec3(hpx - hmx, hpy - hmy, hpz - hmz) / (2.0 * eps);
        vec3 gradUp = vec3(
          max(abs(hpx - h0), abs(h0 - hmx)),
          max(abs(hpy - h0), abs(h0 - hmy)),
          max(abs(hpz - h0), abs(h0 - hmz))
        ) / eps;
        float sulcusSDF = h0 / clamp(length(gradUp), 0.72, 4.8);

        mat3 nm = mat3(vNm0, vNm1, vNm2);
        vec3 gradView = nm * gradObj;
        vec3 tangGrad = gradView - dot(gradView, baseN) * baseN;
        return vec4(normalize(baseN - strength * tangGrad), sulcusSDF);
      }

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      // Single octave energy-conserved ultra-fine copperplate burin stroke (zero blurry grey wash)
      float burinPass(float c, float w, float df) {
        float f = abs(fract(c) - 0.5);
        float aa = clamp(df * 0.82, 0.004, 0.34);
        float minW = clamp(df * 0.28, 0.005, 0.15);
        float drawW = max(w, minW);
        float gain = clamp(w / max(drawW, 0.0001), 0.0, 1.0);
        return (1.0 - smoothstep(max(drawW - aa, 0.0), min(drawW + aa, 0.5), f)) * gain;
      }

      // Screen-space multi-octave LOD engraving helper (hair-fine hero density + compact fixed-octave clarity)
      float engravingLine(float coord, float width, float mask) {
        float w = clamp(width * mask, 0.0, 0.44);
        float present = smoothstep(0.0018, 0.009, w);
        if (present <= 0.001) return 0.0;
        float df1 = max(fwidth(coord), 0.0014);
        float p1 = burinPass(coord, w, df1);
        float p2 = burinPass(coord * 0.5 + 0.25, w, df1 * 0.5);
        float p3 = burinPass(coord * 0.25 + 0.375, w, df1 * 0.25);
        float b12 = smoothstep(0.32, 0.52, df1);
        float b23 = smoothstep(0.64, 0.96, df1);
        float octHero = mix(mix(p1, p2, b12), p3, b23);
        float heroVelvet = clamp(w * 1.75, 0.0, 0.60);
        float heroFull = mix(octHero, heroVelvet, smoothstep(2.40, 3.60, df1));
        if (uCompact <= 0.001) {
          return clamp(heroFull, 0.0, 1.0) * present;
        }
        float wComp = clamp(w * (1.0 + 0.52 * uCompact), 0.0, 0.42);
        float p3c = burinPass(coord * 0.25 + 0.375, wComp, df1 * 0.25);
        float p4c = burinPass(coord * 0.1667 + 0.4167, wComp, df1 * 0.1667);
        float octCompRaw = mix(p3c, p4c, smoothstep(1.10, 2.20, df1));
        float compToVelvet = smoothstep(0.45, 0.72, df1 * 0.1667);
        float velvetComp = uIsLightMode > 0.5 ? clamp(w * 3.8, 0.0, 0.86) : clamp(w * 1.65, 0.0, 0.52);
        float octComp = mix(octCompRaw, velvetComp, compToVelvet);
        return clamp(mix(heroFull, octComp, uCompact), 0.0, 1.0) * present;
      }

      void main() {
        vec3 baseN = normalize(vNormalView);
        vec3 smoothN = normalize(vSmoothNormalView);
        vec3 V = normalize(vViewPos);
        vec3 L = normalize(uLightDir);

        float cerebrumMask = 1.0 - smoothstep(0.0, 0.35, vPart);
        float cerebellumMask = smoothstep(0.75, 1.0, vPart);
        float stemMask = smoothstep(0.35, 0.50, vPart) * (1.0 - cerebellumMask);

        float h = corticalHeight(vBrainCoord);
        float medialFade = smoothstep(0.001, 0.009, abs(vLocalPos.z));
        // Anchor cerebrum normal strictly to smoothN so displaced vertex facets never kink sulci/hatching!
        vec4 gyrusInfo = computeGyrusInfo(smoothN, vBrainCoord, 0.44 * medialFade);
        vec3 N = mix(baseN, gyrusInfo.xyz, cerebrumMask);
        float sulcusSDF = gyrusInfo.w;

        // 1. Razor-crisp anatomical contour (black outer boundary in Dark Mode + protects pure black perimeter in White Mode)
        vec3 silNormal = normalize(mix(smoothN, N, 0.16 * cerebrumMask));
        float ndotv = abs(dot(silNormal, V));
        float fwRim = min(fwidth(ndotv) * 0.90, 0.036) + 0.004;
        float silThresh = mix(0.074, 0.104, uIsLightMode) * (1.0 - 0.32 * stemMask) + 0.048 * uCompact;
        float silhouette = 1.0 - smoothstep(silThresh - fwRim, silThresh + fwRim, ndotv);
        float rimProtect = mix(1.0, smoothstep(0.115, 0.245, ndotv), uIsLightMode);

        // 3D Surface Tone: curved gyrus AO + sculptural light roll-off + Sylvian, tentorial & sagittal crevices
        float ndotl = dot(N, L);
        float baseNdotL = dot(smoothN, L);
        float gyrusAO = (1.0 - smoothstep(0.05, 0.88, h)) * cerebrumMask * medialFade;
        float sylvYRef = -0.10 + 0.26 * vBrainCoord.x + sin(vBrainCoord.x * 6.5) * 0.018;
        float sylvianAO = exp(-pow((vBrainCoord.y - sylvYRef) / 0.058, 2.0)) * exp(-pow((vBrainCoord.x - 0.12) / 0.44, 2.0)) * cerebrumMask * 0.46;
        float tentorialBaseAO = smoothstep(-0.28, -0.58, vLocalPos.y) * smoothstep(0.10, -0.45, vLocalPos.x) * cerebrumMask * 0.40;
        float fissureWave = sin(vBrainCoord.x * 12.0 + vBrainCoord.y * 7.5) * 0.012 +
                            cos(vBrainCoord.x * 22.0 - vBrainCoord.y * 13.0) * 0.005;
        float fissureCleftAO = smoothstep(0.044, 0.0, abs(vLocalPos.z + fissureWave * 0.4)) * (1.0 - smoothstep(-0.25, 0.50, baseNdotL)) * 0.32 * cerebrumMask;
        float rimTurn = pow(1.0 - ndotv, 2.1) * mix(0.32, 0.24, uIsLightMode);
        float tone = clamp((1.0 - (ndotl * 0.56 + 0.44)) * 0.72 + gyrusAO * 0.44 + sylvianAO + tentorialBaseAO + fissureCleftAO + rimTurn, 0.0, 1.0);
        tone = clamp(tone + (1.0 - smoothstep(-0.35, 0.30, baseNdotL)) * 0.28, 0.0, 1.0);

        // White-on-Black luminance driver for Weiß-Modus (lit crowns carry gleaming white hairlines; sulci stay deep black)
        float litRimGlow = pow(clamp(1.0 - ndotv, 0.0, 1.0), 2.1) * smoothstep(-0.08, 0.72, ndotl) * 0.32;
        float lightTone = clamp(
          (ndotl * 0.54 + 0.46) * (0.32 + 0.68 * h) + litRimGlow - sylvianAO * 0.68 - tentorialBaseAO * 0.78 - fissureCleftAO * 0.85,
          0.0,
          1.0
        );

        // 2. Gradient-normalized razor-crisp sulcus crevices (dark ink lines in Dark Mode; pure black recesses in White Mode)
        float creaseThresh = mix(0.0094, 0.0154, 1.0 - smoothstep(-0.28, 0.52, ndotl)) + 0.014 * uCompact;
        float fwSDF = fwidth(sulcusSDF) * 0.80 + 0.0016;
        float sulcusInk = (1.0 - smoothstep(creaseThresh, creaseThresh + fwSDF, sulcusSDF)) * cerebrumMask * medialFade;

        // Organic interlocking sagittal longitudinal fissure
        float fwZ = fwidth(vLocalPos.z) * 0.95 + 0.0016;
        float fissureW = (0.0011 + 0.0075 * uCompact) * (0.65 + 0.40 * (1.0 - h));
        float fissureBreak = mix(0.45, 1.0, smoothstep(-0.35, 0.55, sin(vLocalPos.y * 17.0 + vLocalPos.x * 11.0)));
        float fissureCore = (1.0 - smoothstep(fissureW, fissureW + fwZ, abs(vLocalPos.z + fissureWave))) * fissureBreak;
        float fissureInk = max(fissureCore * 0.52, fissureCleftAO * 0.72) * cerebrumMask;

        // 3. Extra-Fine (~1.55x) Gyrus-Wrapping Atomic Burin Cross-Contour Hatching (engravingLine handles compact octaves)
        vec3 bp = vBrainCoord;
        float gyrusWrap = (h - 0.5) * 1.85;

        float coordA = bp.y * 52.0 + bp.x * 31.0 + bp.z * 17.0 + sin(vBrainCoord.y * 2.2) * 1.90 + gyrusWrap;
        float coordB = bp.x * 34.0 - bp.y * 32.0 + bp.z * 34.0 + cos(vBrainCoord.x * 2.1) * 1.50 - gyrusWrap * 1.05;
        float coordC = bp.x * 19.0 + bp.y * 29.0 - bp.z * 43.0 + sin(vBrainCoord.z * 2.4) * 1.35 + gyrusWrap * 0.85;

        float hatchTone = uIsLightMode > 0.5 ? lightTone : tone;
        float crestGleam = (1.0 - uIsLightMode) * smoothstep(0.76, 0.98, h) * smoothstep(0.32, 0.82, ndotl) * smoothstep(0.08, 0.56, baseNdotL);
        float flankActiveA = clamp(1.0 - crestGleam * 0.86, 0.08, 1.0);
        float widthA = uIsLightMode > 0.5
          ? mix(0.024, 0.156, smoothstep(0.04, 0.90, hatchTone))
          : mix(0.015, 0.124, smoothstep(0.02, 0.90, hatchTone));
        float hatchA = engravingLine(coordA, widthA, flankActiveA);

        // In White Mode, keep cross-hatching in midtone flanks so sunlit crowns stay silky parallel white contours
        float crownTaperB = uIsLightMode > 0.5 ? (1.0 - smoothstep(0.62, 0.84, hatchTone)) : 1.0;
        float activeB = smoothstep(mix(0.36, 0.34, uIsLightMode), mix(0.76, 0.64, uIsLightMode), hatchTone) * crownTaperB *
                        mix(1.0, 0.42, smoothstep(0.20, 0.85, uCompact));
        float widthB = mix(0.014, mix(0.098, 0.072, uIsLightMode), smoothstep(0.34, 0.78, hatchTone));
        float hatchB = engravingLine(coordB, widthB, activeB);

        float crownTaperC = uIsLightMode > 0.5 ? (1.0 - smoothstep(0.70, 0.90, hatchTone)) : 1.0;
        float activeC = smoothstep(mix(0.58, 0.52, uIsLightMode), mix(0.90, 0.78, uIsLightMode), hatchTone) * crownTaperC *
                        (1.0 - smoothstep(0.15, 0.55, uCompact));
        float widthC = mix(0.012, mix(0.082, 0.056, uIsLightMode), smoothstep(0.54, 0.86, hatchTone));
        float hatchC = engravingLine(coordC, widthC, activeC);

        // Ultra-fine copperplate micro-stippling strictly in Dark-Mode sulci valleys (suppress shimmer below ~110px)
        float stippleFade = 1.0 - smoothstep(0.05, 0.35, uCompact);
        vec3 stipWarp = vBrainCoord * 210.0 + vec3(sin(vBrainCoord.y * 23.0), cos(vBrainCoord.z * 29.0), sin(vBrainCoord.x * 31.0)) * 0.36;
        vec3 stipCell = floor(stipWarp);
        vec3 stipFrac = fract(stipWarp) - 0.5;
        float stipRnd = hash31(stipCell);
        vec3 stipJitter = (vec3(stipRnd, hash31(stipCell + 13.7), hash31(stipCell + 29.3)) - 0.5) * 0.48;
        float stipDist = length(stipFrac - stipJitter);
        float fwStip = max(fwidth(stipDist), 0.02);
        float stippleInk = (1.0 - uIsLightMode) * stippleFade * (1.0 - smoothstep(0.072 - fwStip, 0.072 + fwStip, stipDist)) *
                           step(1.0 - smoothstep(0.84, 0.99, tone) * 0.18, stipRnd);

        float cerebrumShade = cerebrumMask * clamp(max(hatchA, max(hatchB, max(hatchC, stippleInk))), 0.0, 1.0);
        float secLod = 1.0 - smoothstep(0.15, 0.60, uCompact);

        // 4. Cerebellum: crisp continuous foliated fan around anterior peduncle (zero grazing flat-wash cutoff)
        float foliaAngle = atan(vLocalPos.y - 0.02, 0.56 - vLocalPos.x);
        float foliaCoord = foliaAngle * 48.0 + cos(vLocalPos.z * 4.5) * 0.14;
        float tentorialAO = smoothstep(-0.02, 0.26, vLocalPos.y) * 0.86;
        float underBellyAO = smoothstep(0.04, -0.26, vLocalPos.y) * 0.68;
        float valleculaAO = exp(-pow(vLocalPos.z / 0.18, 2.0)) * 0.34;
        float cereShadow = clamp(
          (1.0 - smoothstep(-0.28, 0.52, baseNdotL)) * 0.72 + (1.0 - ndotv) * 0.32 + max(tentorialAO, max(underBellyAO, valleculaAO)),
          0.28,
          1.0
        );
        float cereTone = uIsLightMode > 0.5
          ? clamp(1.0 - cereShadow + 0.36 * smoothstep(-0.05, 0.75, baseNdotL) - tentorialAO * 0.78, 0.14, 0.94)
          : cereShadow;
        float foliaInk = cerebellumMask * engravingLine(foliaCoord, mix(0.048, 0.136, cereTone), 1.0);
        float cereRimMask = max(1.0 - smoothstep(0.22, 0.68, ndotv), smoothstep(0.44, 0.88, cereTone)) * smoothstep(0.16, 0.62, cereTone);
        float cereCross = cerebellumMask * engravingLine(vLocalPos.z * 48.0 + vLocalPos.x * 30.0 + vLocalPos.y * 24.0, mix(0.018, 0.082, cereTone), cereRimMask) * secLod;

        // 5. Seam-Free 360° + Underside 3D Atomic Brainstem: unified outward Pontine, Medullary & Bottom-Dome engraving
        float stemT = clamp((0.48 - vLocalPos.y) / 0.88, 0.0, 1.0);
        float stemCX = 0.12 - stemT * 0.08 - pow(max(0.0, stemT - 0.50), 1.28) * 0.30;
        float stemForward = smoothstep(-0.12, 0.72, vLocalPos.x - stemCX + 0.08);
        float ponsZone = exp(-pow((vLocalPos.y - 0.055) / 0.16, 2.0));
        float pontomedullaryCrease = exp(-pow((vLocalPos.y + 0.084) / 0.020, 2.0)) * stemForward;
        float medZone = smoothstep(-0.04, -0.22, vLocalPos.y);
        float superiorNeckAO = smoothstep(0.16, 0.40, vLocalPos.y) * 0.44;
        float underCapAO = smoothstep(-0.42, -0.88, vObjNormal.y) * 0.36;
        float stemShadow = clamp(
          (1.0 - smoothstep(-0.28, 0.64, baseNdotL)) * 0.74 +
          max(pontomedullaryCrease * 0.80, max(superiorNeckAO, underCapAO)) +
          (1.0 - ndotv) * 0.32,
          0.18,
          1.0
        );
        float stemTone = uIsLightMode > 0.5
          ? clamp(0.12 + smoothstep(-0.32, 0.74, baseNdotL) * 0.76 - pontomedullaryCrease * 0.72 - underCapAO * 0.45, 0.12, 0.88)
          : stemShadow;

        // Primary transverse fibers curving across Pons & side shaft (single sleek contour layer on sunlit White-Mode crests)
        float pontineFibers = stemMask * engravingLine(
          vLocalPos.y * 68.0 - smoothstep(-0.06, 0.24, vLocalPos.x - stemCX) * 1.35,
          uIsLightMode > 0.5 ? mix(0.024, 0.124, stemTone) : mix(0.020, 0.106, stemTone),
          max(smoothstep(0.05, 0.42, ponsZone + (1.0 - medZone) * 0.50), 0.72)
        );

        // Exact branch-cut-free 20-cycle longitudinal tracts wrapping smoothly 360° around Medulla & tapering before apex
        vec2 stemRadVec = vec2(vLocalPos.x - stemCX, vLocalPos.z);
        float stemRLen = max(length(stemRadVec), 0.001);
        vec2 stemUV = stemRadVec / stemRLen;
        float stemAzCyc = atan(stemUV.y, stemUV.x) * (20.0 / 6.2831853);
        vec2 gradThetaX = vec2(dFdx(stemUV.y), dFdy(stemUV.y)) * stemUV.x - vec2(dFdx(stemUV.x), dFdy(stemUV.x)) * stemUV.y;
        float dfAz = clamp(length(gradThetaX) * (20.0 / 6.2831853), 0.002, 2.0);
        float stemAzCrownTaper = uIsLightMode > 0.5 ? (1.0 - smoothstep(0.56, 0.82, stemTone)) : 1.0;
        float stemAzMask = stemMask * max(smoothstep(0.08, 0.52, medZone), 0.40 * (1.0 - ndotv)) * stemAzCrownTaper * (1.0 - smoothstep(0.42, 0.80, dfAz));
        float stemAzW = clamp(mix(0.018, mix(0.094, 0.068, uIsLightMode), stemTone) * stemAzMask, 0.0, 0.42);
        float medGrooves = (stemAzW > 0.002 ? burinPass(stemAzCyc, stemAzW, dfAz) * smoothstep(0.0018, 0.008, stemAzW) : 0.0) * secLod;

        // Concentric rounded dome engraving across the hemispherical bottom tip when looking from below
        float underCapMask = smoothstep(-0.36, -0.78, vObjNormal.y);
        float underBevelHatch = stemMask * engravingLine(
          stemRLen * 62.0,
          mix(0.022, mix(0.098, 0.112, uIsLightMode), stemTone),
          underCapMask
        ) * secLod;

        float stemCross = stemMask * engravingLine(
          vLocalPos.y * 58.0 + vLocalPos.z * 28.0,
          mix(0.016, mix(0.084, 0.062, uIsLightMode), stemTone),
          smoothstep(0.36, 0.78, stemTone) * stemAzCrownTaper * (1.0 - underCapMask * 0.6)
        ) * secLod;
        float foliaCombined = max(foliaInk, cereCross);
        float stemCombined = max(pontineFibers, max(medGrooves, max(stemCross, underBevelHatch)));

        float darkModeInk = clamp(
          max(silhouette, max(sulcusInk, max(fissureInk, max(cerebrumShade, max(foliaCombined, stemCombined))))),
          0.0,
          1.0
        );
        // In White Mode (black base #0e0e11, white lines #ffffff), keep perimeter silhouette, sulci & fissure jet black
        float blackKeep = clamp(1.0 - max(silhouette * 0.98, max(sulcusInk * 0.96, fissureInk * 0.94)), 0.0, 1.0);
        float whiteModeInk = clamp(max(cerebrumShade, max(foliaCombined, stemCombined)) * blackKeep * rimProtect, 0.0, 1.0);
        float ink = uIsLightMode > 0.5 ? whiteModeInk : darkModeInk;
        vec3 color = mix(uFillColor, uLineColor, ink);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

/**
 * Builds the 3D Mason Jar BufferGeometry with SplineCurve body/base and true helical 3D neck screw threads.
 */
function buildJarGeometry() {
  const bodyCurve = new THREE.SplineCurve([
    new THREE.Vector2(0.0, -1.42),
    new THREE.Vector2(0.68, -1.41),
    new THREE.Vector2(0.86, -1.35),
    new THREE.Vector2(0.97, -1.22),
    new THREE.Vector2(1.03, -1.04),
    new THREE.Vector2(1.04, -0.78),
    new THREE.Vector2(1.04, 0.42),
    new THREE.Vector2(1.02, 0.62),
    new THREE.Vector2(0.95, 0.75),
    new THREE.Vector2(0.83, 0.84),
    new THREE.Vector2(0.765, 0.875),
  ]);
  const basePts = bodyCurve.getPoints(72);

  // Subdivided smooth cylindrical neck for true diagonal helical screw thread relief
  const neckSteps = 64;
  for (let s = 1; s <= neckSteps; s++) {
    const t = s / neckSteps;
    basePts.push(new THREE.Vector2(0.765, 0.875 + t * (1.15 - 0.875)));
  }

  const radialSegs = 112;
  const rows = basePts.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  const pitch = 0.115;
  for (let i = 0; i < rows; i++) {
    const p = basePts[i];
    const y = p.y;
    const vCoord = i / (rows - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const uCoord = j / radialSegs;
      const theta = uCoord * Math.PI * 2;
      let r = p.x;

      // Apply 1.65-turn helical Mason jar screw thread ridge around neck (y in 0.88..1.075)
      if (y > 0.875 && y < 1.085 && r > 0.5) {
        const helixY = y - (theta / (Math.PI * 2)) * pitch;
        const modPhase = ((helixY - 0.88) % pitch + pitch) % pitch;
        const beadDist = Math.abs(modPhase - pitch * 0.5) / (pitch * 0.34);
        const beadProfile = beadDist < 1.0 ? Math.pow(Math.cos(beadDist * Math.PI * 0.5), 1.35) : 0.0;
        const threadMask =
          Math.min(1.0, Math.max(0.0, (y - 0.875) / 0.032)) *
          Math.min(1.0, Math.max(0.0, (1.075 - y) / 0.032));
        r += beadProfile * threadMask * 0.048;
      }

      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
      uvs.push(uCoord, vCoord);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Stippled Contact Shadow Disc directly beneath the jar base (anchors the heavy glass bottom cleanly).
 */
function createBaseShadowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInkColor: { value: new THREE.Color('#ffffff') },
      uIsLightMode: { value: 0.0 },
      uOrbitYaw: { value: 0.0 },
      uCompact: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uOrbitYaw;
      varying vec2 vXZ;
      void main() {
        float cy = cos(uOrbitYaw);
        float sy = sin(uOrbitYaw);
        vXZ = vec2(position.x * cy - position.z * sy, position.x * sy + position.z * cy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      uniform float uIsLightMode;
      uniform float uCompact;
      varying vec2 vXZ;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        // Pure dark-mode void under jar — zero white salt dust on black background
        if (uIsLightMode < 0.5) discard;

        // Subtle crescent contact shadow hugging outer left-bottom heel, transparent through center glass floor!
        vec2 shifted = vec2((vXZ.x + 0.22) / 0.98, (vXZ.y + 0.04) / 0.80);
        float d = length(shifted);
        if (d > 1.0) discard;

        // Clear refractive glass interior: strongly attenuate center so inner glass punt basin shines clearly
        float rOrigin = length(vXZ);
        float glassClearPass = mix(0.08, 1.0, smoothstep(0.66, 0.94, rOrigin));
        float outerTail = smoothstep(0.68, 0.96, rOrigin) * smoothstep(-0.05, 0.45, -vXZ.x + 0.18);
        float crescentMask = max(glassClearPass, outerTail * 0.92) * (1.0 - smoothstep(0.42, 1.0, d));

        // Crisp delicate horizontal copperplate contact strokes anchoring heavy glass heel
        float rowCoord = vXZ.y * 54.0 + 0.22 * sin(vXZ.x * 5.2 + vXZ.y * 3.1);
        float rowIdx = floor(rowCoord);
        float rowPhase = fract(rowCoord) - 0.5;
        float rHash = hash21(vec2(rowIdx, 3.7));
        float segHash = hash21(vec2(floor(vXZ.x * 8.0 + rHash * 7.0), rowIdx));

        float lineDensity = smoothstep(0.06, 0.72, crescentMask);
        float halfW = (0.011 + 0.036 * lineDensity) * (0.78 + 0.34 * rHash);
        float fw = max(fwidth(rowCoord), 0.020);
        float lineMask = 1.0 - smoothstep(halfW - fw, halfW + fw, abs(rowPhase));
        float breakMask = smoothstep(0.18, 0.52, lineDensity + (segHash - 0.5) * 0.30);

        float ink = lineMask * breakMask;
        if (ink < 0.03) discard;
        gl_FragColor = vec4(uInkColor, ink * mix(0.76, 0.92, lineDensity) * (1.0 - smoothstep(0.25, 0.75, uCompact)));
      }
    `,
  });
}

/**
 * Dedicated 3D Inner Base Punt Basin Geometry (strictly bottom dish y = -1.255..-1.045, ZERO inner jar walls!).
 * Reveals unmistakable heavy glass bottom thickness via true 3D perspective meniscus.
 */
function buildBasePuntGeometry() {
  const puntCurve = new THREE.SplineCurve([
    new THREE.Vector2(0.0, -1.255),
    new THREE.Vector2(0.56, -1.248),
    new THREE.Vector2(0.76, -1.215),
    new THREE.Vector2(0.87, -1.145),
    new THREE.Vector2(0.925, -1.045),
  ]);
  return new THREE.LatheGeometry(puntCurve.getPoints(36), 96);
}

/**
 * Pen-and-Ink Inner Base Punt Meniscus Shader: draws the curved inner glass bottom contour
 * and delicate heel corner ticks, fading smoothly before y = -1.06 so there is never an inner cylinder wall.
 */
function createBasePuntMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInkColor: { value: new THREE.Color('#ffffff') },
      uOrbitYaw: { value: 0.0 },
      uFreeOrbit: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uOrbitYaw;
      uniform float uFreeOrbit;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vShadePos;

      void main() {
        vLocalPos = position;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        if (uFreeOrbit >= 0.5) {
          vec3 mvOrigin = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vShadePos = mvPos.xyz - mvOrigin;
        } else {
          float cy = cos(uOrbitYaw);
          float sy = sin(uOrbitYaw);
          vShadePos = vec3(position.x * cy - position.z * sy, position.y, position.x * sy + position.z * cy);
        }
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vShadePos;

      void main() {
        vec3 N = normalize(vNormalView);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(vViewPos);
        float ndotv = abs(dot(N, V));
        float rXZ = length(vLocalPos.xz);
        float normX = vShadePos.x / max(rXZ, 0.25);
        float rightBias = smoothstep(-0.85, 0.85, vShadePos.x);
        float angle = atan(vLocalPos.z, vLocalPos.x);

        // Fade seamlessly out before top lip so NO vertical inner-wall artifact can ever appear
        float topFade = 1.0 - smoothstep(-1.14, -1.065, vLocalPos.y);
        if (topFade < 0.01) discard;

        // Crisp 1.5px inner glass bowl meniscus hairline (zero blurry smear blob!)
        float rimBand = smoothstep(0.70, 0.86, rXZ);
        float fwRim = max(fwidth(ndotv) * 1.1, 0.007);
        float rimThresh = mix(0.115, 0.065, rightBias);
        float meniscusContour = (1.0 - smoothstep(rimThresh - fwRim, rimThresh + fwRim, ndotv)) * rimBand;

        // Crisp razor-sharp floor corner meniscus tapering smoothly to zero in right highlight lane
        float fwR = max(fwidth(rXZ), 0.003);
        float cornerGap = smoothstep(0.22, 0.65, 1.0 - exp(-pow((normX - 0.58) / 0.13, 2.0)) * step(0.0, vShadePos.z));
        float cornerW = 0.0032 * mix(1.0, 0.48, rightBias) * cornerGap;
        float floorCornerLine = (1.0 - smoothstep(cornerW, cornerW + fwR * 1.1, abs(rXZ - 0.81))) *
                                smoothstep(-1.24, -1.16, vLocalPos.y) * smoothstep(0.05, 0.30, cornerGap);

        // Fine radial-angular cross-contour hairlines matched to angle * 58.0 outer heel phase (zero moiré clash!)
        float tickCoord = angle * 58.0;
        float dfTick = max(fwidth(tickCoord), 0.002);
        float minTickW = clamp(dfTick * 0.34, 0.006, 0.16);
        float nyqTick = 1.0 - smoothstep(0.38, 0.62, dfTick);
        float drawTickW = max(0.024, minTickW);
        float tickGain = clamp(0.024 / drawTickW, 0.0, 1.0);
        float radialBand = smoothstep(0.73, 0.83, rXZ) * (1.0 - smoothstep(0.86, 0.92, rXZ)) * (1.0 - smoothstep(-0.88, -0.22, vShadePos.x));
        float leftTicks = (1.0 - smoothstep(max(drawTickW - dfTick * 0.85, 0.0), min(drawTickW + dfTick * 0.85, 0.5), abs(fract(tickCoord) - 0.5))) *
                          tickGain * nyqTick * radialBand * 0.68;

        float alpha = clamp(max(meniscusContour * mix(0.92, 0.54, rightBias), max(floorCornerLine * 0.88, leftTicks)), 0.0, 1.0) * topFade;

        if (alpha < 0.02) discard;
        gl_FragColor = vec4(uInkColor, alpha);
      }
    `,
  });
}

/**
 * Builds a sculptural 3D fluted Metal Screw Lid (Deckel) with physical vertical flutes, rolled lip,
 * undercut shadow groove, chamfer bevel, raised sealing bead & brushed convex dome top.
 */
function buildLidGeometry() {
  const profile = [
    { r: 0.0,   y: 1.075, flute: 0.0 },  // Watertight lid interior underside center
    { r: 0.760, y: 1.075, flute: 0.0 },  // Watertight underside outer rim
    { r: 0.822, y: 1.055, flute: 0.0 },  // Bottom lip tuck
    { r: 0.858, y: 1.078, flute: 0.0 },  // Rolled bottom curl outer apex
    { r: 0.852, y: 1.104, flute: 0.0 },  // Rolled lip top curve
    { r: 0.818, y: 1.118, flute: 0.0 },  // Crisp undercut groove
    { r: 0.832, y: 1.132, flute: 0.5 },  // Flute base transition
    { r: 0.834, y: 1.158, flute: 1.0 },  // Physical 3D knurl skirt lower
    { r: 0.834, y: 1.275, flute: 1.0 },  // Physical 3D knurl skirt upper
    { r: 0.828, y: 1.305, flute: 0.4 },  // Flute shoulder transition
    { r: 0.806, y: 1.352, flute: 0.0 },  // Upper metallic chamfer bevel
    { r: 0.768, y: 1.376, flute: 0.0 },  // Outer sealing bead crest
    { r: 0.722, y: 1.378, flute: 0.0 },  // Inner ring edge
    { r: 0.678, y: 1.364, flute: 0.0 },  // Recessed step wall
    { r: 0.420, y: 1.384, flute: 0.0 },  // Convex brushed metallic dome mid
    { r: 0.0,   y: 1.394, flute: 0.0 },  // Convex dome apex (visible brushed engraving rings!)
  ];

  const radialSegs = 144; // 36 physical knurl flutes * 4 segments per flute
  const fluteCount = 36;
  const rows = profile.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < rows; i++) {
    const p = profile[i];
    const vCoord = i / (rows - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const uCoord = j / radialSegs;
      const theta = uCoord * Math.PI * 2;
      // Smooth rounded vertical flute relief
      const rib = Math.cos(theta * fluteCount);
      const shapedRib = Math.sign(rib) * Math.pow(Math.abs(rib), 0.78);
      const radius = p.r + p.flute * shapedRib * 0.0145;
      positions.push(Math.cos(theta) * radius, p.y, Math.sin(theta) * radius);
      uvs.push(uCoord, vCoord);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Pure Pen-and-Ink 3D Glass Jar Shader: crisp contours, spiral helical neck threads,
 * grounded glass base heel meniscus & stippling, and drawn reflection strokes (zero foggy CAD blur).
 */
function createGlassMaterial(isFront) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInkColor: { value: new THREE.Color('#ffffff') },
      uShadowColor: { value: new THREE.Color('#050507') },
      uHighlightColor: { value: new THREE.Color('#ffffff') },
      uIsLightMode: { value: 0.0 },
      uFrontPass: { value: isFront ? 1.0 : 0.0 },
      uOrbitYaw: { value: 0.0 },
      uCompact: { value: 0.0 },
      uFreeOrbit: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    side: isFront ? THREE.FrontSide : THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float uOrbitYaw;
      uniform float uFreeOrbit;
      varying vec3 vNormalView;
      varying vec3 vNormalObj;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vShadePos;

      void main() {
        vLocalPos = position;
        vNormalObj = normalize(normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        if (uFreeOrbit >= 0.5) {
          vec3 mvOrigin = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vShadePos = mvPos.xyz - mvOrigin;
        } else {
          float cy = cos(uOrbitYaw);
          float sy = sin(uOrbitYaw);
          vShadePos = vec3(position.x * cy - position.z * sy, position.y, position.x * sy + position.z * cy);
        }
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      uniform vec3 uShadowColor;
      uniform vec3 uHighlightColor;
      uniform float uIsLightMode;
      uniform float uFrontPass;
      uniform float uCompact;

      varying vec3 vNormalView;
      varying vec3 vNormalObj;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vShadePos;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float glassBurinPass(float c, float w, float df) {
        float f = abs(fract(c) - 0.5);
        float aa = clamp(df * 0.85, 0.004, 0.34);
        float minW = clamp(df * 0.34, 0.006, 0.18);
        float drawW = max(w, minW);
        float gain = clamp(w / max(drawW, 0.0001), 0.0, 1.0);
        return (1.0 - smoothstep(max(drawW - aa, 0.0), min(drawW + aa, 0.5), f)) * gain;
      }

      float taperedPenLine(float coord, float width, float mask) {
        float w = clamp(width * mask, 0.0, 0.42);
        float present = smoothstep(0.0018, 0.009, w);
        if (present <= 0.001) return 0.0;
        float df1 = max(fwidth(coord), 0.0015);
        float p1 = glassBurinPass(coord, w, df1);
        float p2 = glassBurinPass(coord * 0.5 + 0.25, w, df1 * 0.5);
        float b12 = smoothstep(0.32, 0.54, df1);
        float hero = clamp(mix(p1, p2, b12), 0.0, 1.0);
        if (uCompact <= 0.001) return hero * present;
        float p3 = glassBurinPass(coord * 0.25 + 0.375, min(w * 1.25, 0.42), df1 * 0.25);
        float nyq = 1.0 - smoothstep(0.42, 0.72, df1 * 0.25);
        float comp = mix(hero, p3 * nyq, smoothstep(0.65, 1.15, df1)) * nyq;
        return mix(hero, comp, uCompact) * present;
      }

      void main() {
        vec3 N = normalize(vNormalView);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(vViewPos);

        float ndotv = abs(dot(N, V));
        float rXZ = length(vLocalPos.xz);
        float rightBias = smoothstep(-0.88, 0.88, vShadePos.x);
        float frontFacing = smoothstep(-0.08, 0.16, vShadePos.z);

        // Camera-aligned normalized cylindrical X coordinate (-1 left edge .. +1 right edge, continuous across 360° orbit!)
        float normX = vShadePos.x / max(rXZ, 0.32);
        float angle = atan(vLocalPos.z, vLocalPos.x);

        // 1. Crisp unbroken pen-and-ink outer glass contour (bold left shadow, delicate right lit wall, closed bottom heel without center flood)
        float isFlatCenterBottom = smoothstep(0.76, 0.94, abs(vNormalObj.y)) * (1.0 - smoothstep(0.58, 0.78, rXZ));
        float rimThreshold = mix(mix(0.145, 0.175, uCompact), mix(0.068, 0.118, uCompact), rightBias);
        rimThreshold = mix(rimThreshold, 0.082 + 0.032 * uCompact, smoothstep(-1.32, -1.43, vLocalPos.y));
        float fwRim = max(fwidth(ndotv) * 1.15, 0.0065);
        float rim = (1.0 - smoothstep(rimThreshold - fwRim, rimThreshold + fwRim, ndotv)) * (1.0 - isFlatCenterBottom);
        float rimStrength = clamp(mix(0.98, 0.68, rightBias) + 0.24 * uCompact, 0.0, 1.0);
        float glassFineLod = 1.0 - smoothstep(0.18, 0.65, uCompact);

        // Continuous front-right specular negative-space highlight lane (carves cleanly through cylinder & shoulder)
        float highlightLane = exp(-pow((normX - 0.61) / 0.105, 2.0)) *
                              smoothstep(-1.14, -0.78, vLocalPos.y) * (1.0 - smoothstep(0.84, 0.91, vLocalPos.y)) *
                              frontFacing;

        // 2. Analytic Helical 3D Glass Screw Threads (smooth continuous wrap & micro-fine overhang hatching)
        float isThreadZone = smoothstep(0.885, 0.912, vLocalPos.y) * (1.0 - smoothstep(1.045, 1.076, vLocalPos.y));
        float helixPhi = (vLocalPos.y - 0.88) * 6.2831853 / 0.115 - angle;
        float sinPhi = sin(helixPhi);
        float cosPhi = cos(helixPhi);
        float fwSin = max(fwidth(sinPhi), 0.022);
        float threadSideMask = smoothstep(0.58, -0.10, cosPhi);
        float threadWScale = mix(1.0, 0.54, rightBias) * (1.0 - highlightLane * 0.85);
        float threadUnderEdge = (1.0 - smoothstep(0.030 * threadWScale, 0.030 * threadWScale + fwSin * 1.10, abs(sinPhi + 0.78))) * threadSideMask;
        float threadCrestEdge = (1.0 - smoothstep(0.022 * threadWScale, 0.022 * threadWScale + fwSin * 1.10, abs(sinPhi - 0.80))) * threadSideMask;
        float threadShadowTick = smoothstep(-0.38, -0.88, sinPhi) * threadSideMask *
                                 taperedPenLine(angle * 64.0 + vLocalPos.y * 14.0, 0.034, 1.0 - rightBias * 0.58) * glassFineLod;
        float threadInk = isThreadZone * step(0.5, uFrontPass) * (1.0 - highlightLane * 0.85) *
                          max(max(threadUnderEdge * 0.94, threadCrestEdge * 0.74), threadShadowTick * 0.82);

        // Hatched lid-overhang cast shadow band + collar lines beneath rolled cap rim
        float fwY = max(fwidth(vLocalPos.y), 0.002);
        float collarGap = 1.0 - highlightLane * 0.85;
        float collarA = (1.0 - smoothstep(0.0026, 0.0026 + fwY * 1.1, abs(vLocalPos.y - 1.070))) * mix(0.88, 0.34, rightBias);
        float collarB = (1.0 - smoothstep(0.0022, 0.0022 + fwY * 1.1, abs(vLocalPos.y - 1.084))) * mix(0.72, 0.22, rightBias);
        float overhangCast = smoothstep(1.032, 1.052, vLocalPos.y) * (1.0 - smoothstep(1.068, 1.082, vLocalPos.y)) *
                             taperedPenLine(angle * 68.0 + vLocalPos.y * 28.0, 0.042, 1.0 - rightBias * 0.76) * 0.86 * glassFineLod;
        float neckHatch = max(max(collarA, collarB), overhangCast) * collarGap * step(0.5, uFrontPass);

        // 3. Crisp lower heel glass refraction curve (paired with 3D Base Punt Dish at renderOrder 0!)
        float heelTargetY = -1.352 + 0.072 * pow(clamp(rXZ / 0.96, 0.0, 1.0), 2.2);
        float fwHeel = max(fwidth(vLocalPos.y - heelTargetY), 0.004);
        float baseHeelLine = (1.0 - smoothstep(0.0030, 0.0030 + fwHeel * 1.1, abs(vLocalPos.y - heelTargetY))) *
                             smoothstep(0.28, 0.58, rXZ) * (1.0 - smoothstep(0.84, 0.97, rXZ)) *
                             (1.0 - smoothstep(-0.22, 0.42, vShadePos.x)) * step(0.5, uFrontPass) * 0.82;

        // 4. Glass Specular Reflections: Dark Mode ribbons & Light Mode delicate razor-fine shoulder flicks
        float fwNormX = max(fwidth(normX), 0.003);
        float streamVertMask = smoothstep(-1.02, -0.70, vLocalPos.y) * (1.0 - smoothstep(0.68, 0.835, vLocalPos.y)) * frontFacing;
        float meniscusBreak = 1.0 - 0.90 * exp(-pow((vLocalPos.y - 0.41) / 0.032, 2.0));
        float breakA = smoothstep(0.22, 0.54, abs(sin(vLocalPos.y * 3.1 + 0.45))) * meniscusBreak;
        float breakB = smoothstep(0.28, 0.60, abs(cos(vLocalPos.y * 2.5 - 0.30))) * meniscusBreak;
        float frameInner = (1.0 - smoothstep(0.0020, 0.0020 + fwNormX * 1.05, abs(normX - 0.540))) *
                           streamVertMask * mix(0.08, 1.0, breakA);
        float frameOuter = (1.0 - smoothstep(0.0016, 0.0016 + fwNormX * 1.05, abs(normX - 0.672))) *
                           smoothstep(-0.92, -0.58, vLocalPos.y) * (1.0 - smoothstep(0.62, 0.78, vLocalPos.y)) *
                           frontFacing * mix(0.05, 1.0, breakB) * (1.0 - 0.68 * uCompact);
        float darkSpec = max(frameInner * 0.86, frameOuter * 0.76);

        // Light Mode uses clean paper negative space for specular glass reflections rather than dark floating interior strokes
        float drawnHighlightLines = darkSpec * (1.0 - uIsLightMode) * step(0.5, uFrontPass);

        // 5. Ultra-Fine Gossamer Copperplate Pen Hatching (discrete dual-octave crossfade from 58.0 hero to 20.0 dock ribs)
        float edgeCurve = pow(clamp(1.0 - ndotv, 0.0, 1.0), 1.45);
        float leftShadowGrad = 1.0 - smoothstep(-0.98, -0.26, normX);

        // Clean geometric zones (clamped below neck join rXZ > 0.78 so zero comb hairs escape shoulder top!)
        float shoulderZone = smoothstep(0.46, 0.66, vLocalPos.y) * (1.0 - smoothstep(0.835, 0.875, vLocalPos.y)) * smoothstep(0.765, 0.815, rXZ);
        float heelZone = smoothstep(-1.41, -1.28, vLocalPos.y) * (1.0 - smoothstep(-1.14, -0.94, vLocalPos.y));
        float tankWallZone = smoothstep(-1.05, -0.78, vLocalPos.y) * (1.0 - smoothstep(0.50, 0.68, vLocalPos.y));

        // 5A. Unified C1-continuous form-wrapping meridians (58.0 hero hairlines / 20.0 compact ribs)
        float sBend = 0.65 * sin(clamp(vLocalPos.y - 0.58, 0.0, 0.35) * 4.2) -
                      0.52 * sin(clamp(-1.08 - vLocalPos.y, 0.0, 0.35) * 4.5);
        float unifiedMeridianCoord = angle * 58.0 + sBend;
        float compactMeridianCoord = angle * 20.0 + sBend * 0.5;

        float shoulderReach = -0.22 + 0.16 * sin(angle * 23.0) + 0.09 * cos(angle * 41.0);
        float shoulderStagger = 1.0 - smoothstep(shoulderReach - 0.24, shoulderReach + 0.16, normX);
        float shoulderMeridianMask = shoulderZone * clamp(shoulderStagger * (0.45 + 0.65 * edgeCurve) + edgeCurve * 0.28 * (1.0 - rightBias * 0.82), 0.0, 1.0) *
                                     (1.0 - highlightLane * 0.96) * frontFacing;
        float shoulderHatchHero = uCompact < 0.99 ? taperedPenLine(unifiedMeridianCoord, mix(0.014, 0.042, shoulderMeridianMask), shoulderMeridianMask) : 0.0;
        float shoulderHatchComp = uCompact > 0.01 ? taperedPenLine(compactMeridianCoord, mix(0.018, 0.052, shoulderMeridianMask), shoulderMeridianMask) : 0.0;
        float shoulderHatch = mix(shoulderHatchHero, shoulderHatchComp, uCompact);

        float heelReach = -0.14 + 0.18 * cos(angle * 21.0) + 0.09 * sin(angle * 37.0);
        float heelStagger = 1.0 - smoothstep(heelReach - 0.26, heelReach + 0.16, normX);
        float heelMeridianMask = heelZone * clamp(heelStagger * (0.48 + 0.65 * edgeCurve) + edgeCurve * 0.26 * (1.0 - rightBias * 0.82), 0.0, 1.0) *
                                 (1.0 - highlightLane * 0.96) * smoothstep(0.14, 0.35, ndotv) * frontFacing;
        float heelHero = uCompact < 0.99 ? taperedPenLine(unifiedMeridianCoord, mix(0.013, 0.038, heelMeridianMask), heelMeridianMask) : 0.0;
        float heelComp = uCompact > 0.01 ? taperedPenLine(compactMeridianCoord, mix(0.016, 0.048, heelMeridianMask), heelMeridianMask) : 0.0;
        float heelMeridian = mix(heelHero, heelComp, uCompact);

        // 5B. Delicate Acute Cross-Hatching strictly inside deepest left shadow crescent (faded in compact docks)
        float deepCrescent = smoothstep(0.46, 0.88, leftShadowGrad * edgeCurve) * (1.0 - highlightLane * 0.96) * frontFacing;
        float shoulderCrossCoord = (vLocalPos.y * 0.74 + rXZ * 0.66) * 52.0 + angle * 24.0;
        float shoulderCross = taperedPenLine(shoulderCrossCoord, 0.024, shoulderZone * deepCrescent) * glassFineLod;

        float heelCrossCoord = (vLocalPos.y * 0.72 - rXZ * 0.68) * 48.0 + angle * 22.0;
        float heelOuterCrescent = deepCrescent * (1.0 - smoothstep(-0.95, -0.78, normX));
        float heelCross = taperedPenLine(heelCrossCoord, 0.018, heelZone * heelOuterCrescent * smoothstep(0.18, 0.36, ndotv)) * glassFineLod;

        // 5C. Left Tank Body Wall: seamless continuation of meridians (fine broken burin strokes)
        float wallStrokeBreak = smoothstep(0.14, 0.56, abs(sin(angle * 21.0 + vLocalPos.y * 2.5))) *
                                smoothstep(0.10, 0.46, abs(cos(angle * 31.0 - vLocalPos.y * 3.1)));
        float wallMeridianMask = tankWallZone * (1.0 - smoothstep(-0.985, -0.70, normX)) *
                                 smoothstep(0.14, 0.34, ndotv) * mix(0.32, 1.0, wallStrokeBreak) * frontFacing;
        float wallHero = uCompact < 0.99 ? taperedPenLine(unifiedMeridianCoord, mix(0.012, 0.032, edgeCurve), wallMeridianMask) : 0.0;
        float wallComp = uCompact > 0.01 ? taperedPenLine(compactMeridianCoord, mix(0.015, 0.042, edgeCurve), wallMeridianMask) : 0.0;
        float wallMeridians = mix(wallHero, wallComp, uCompact);

        // 5D. Gossamer right-edge form ticks strictly on outer right curvature away from highlight lane
        float rightTurnTicks = (shoulderZone + heelZone) * smoothstep(0.78, 0.97, normX) *
                               (1.0 - highlightLane) * smoothstep(0.18, 0.42, ndotv) * frontFacing *
                               taperedPenLine(angle * 58.0 + sin(vLocalPos.y * 4.0) * 0.15, 0.015, 0.78) * 0.50 * glassFineLod;

        float glassHatching = max(
          max(shoulderHatch, shoulderCross),
          max(max(heelMeridian, heelCross), max(wallMeridians, rightTurnTicks))
        ) * mix(1.0, 0.72, uCompact);

        if (uFrontPass < 0.5) {
          float backAlpha = rim * 0.22 * rimStrength;
          if (backAlpha < 0.02) discard;
          gl_FragColor = vec4(uInkColor, backAlpha);
          return;
        }

        float inkAlpha = clamp(
          max(rim * rimStrength,
            max(threadInk,
              max(neckHatch,
                max(baseHeelLine,
                  max(drawnHighlightLines, glassHatching * 0.88))))),
          0.0,
          1.0
        );
        if (inkAlpha < 0.02) discard;
        gl_FragColor = vec4(uInkColor, inkAlpha);
      }
    `,
  });
}

/**
 * Pure 1-Bit Pen-and-Ink Copperplate Screw Lid (Deckel) Shader:
 * Shading emerges strictly through burin line weight, hatching density, and negative-space highlights
 * across the physical 3D fluted ribs (zero blurry Phong or airbrush grey haze).
 */
function createLidMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFillColor: { value: new THREE.Color('#111113') },
      uInkColor: { value: new THREE.Color('#ffffff') },
      uLightDir: { value: new THREE.Vector3(0.55, 0.72, 0.52).normalize() },
      uIsLightMode: { value: 0.0 },
      uOrbitYaw: { value: 0.0 },
      uCompact: { value: 0.0 },
      uFreeOrbit: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uOrbitYaw;
      uniform float uFreeOrbit;

      varying vec3 vNormalView;
      varying vec3 vNormalObj;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vShadePos;

      void main() {
        vLocalPos = position;
        vNormalObj = normalize(normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        if (uFreeOrbit >= 0.5) {
          vec3 mvOrigin = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vShadePos = mvPos.xyz - mvOrigin;
        } else {
          float cy = cos(uOrbitYaw);
          float sy = sin(uOrbitYaw);
          vShadePos = vec3(position.x * cy - position.z * sy, position.y, position.x * sy + position.z * cy);
        }
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFillColor;
      uniform vec3 uInkColor;
      uniform vec3 uLightDir;
      uniform float uIsLightMode;
      uniform float uCompact;

      varying vec3 vNormalView;
      varying vec3 vNormalObj;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vShadePos;

      float lidBurinPass(float c, float w, float df) {
        float f = abs(fract(c) - 0.5);
        float aa = clamp(df * 0.85, 0.004, 0.34);
        float minW = clamp(df * 0.34, 0.006, 0.18);
        float drawW = max(w, minW);
        float gain = clamp(w / max(drawW, 0.0001), 0.0, 1.0);
        return (1.0 - smoothstep(max(drawW - aa, 0.0), min(drawW + aa, 0.5), f)) * gain;
      }

      float lidLine(float coord, float width, float mask) {
        float w = clamp(width * mask, 0.0, 0.42);
        float present = smoothstep(0.002, 0.010, w);
        if (present <= 0.001) return 0.0;
        float df1 = max(fwidth(coord), 0.0015);
        float p1 = lidBurinPass(coord, w, df1);
        float p2 = lidBurinPass(coord * 0.5 + 0.25, w, df1 * 0.5);
        float b12 = smoothstep(0.34, 0.56, df1);
        float nyq = mix(1.0, 1.0 - smoothstep(0.42, 0.68, df1 * 0.5), uCompact);
        return clamp(mix(p1, p2, b12), 0.0, 1.0) * nyq * present;
      }

      float lidSdSeg(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
        return length(pa - ba * h);
      }

      float lidSdArc(vec2 p, vec2 center, vec2 dirMid, vec2 scHalf, float rad) {
        vec2 q = p - center;
        vec2 ql = vec2(abs(dot(q, vec2(dirMid.y, -dirMid.x))), dot(q, dirMid));
        return (scHalf.y * ql.x < scHalf.x * ql.y)
          ? abs(length(ql) - rad)
          : length(ql - rad * scHalf);
      }

      // Precision engraved "K3PTA" wordmark SDF in lid-top coordinates (x: left->right, y: bottom->top)
      float k3ptaSDF(vec2 lp) {
        float d = 10.0;

        // K (center -0.376)
        vec2 pk = lp - vec2(-0.376, 0.0);
        d = min(d, lidSdSeg(pk, vec2(-0.056, -0.115), vec2(-0.056, 0.115)));
        d = min(d, lidSdSeg(pk, vec2(-0.052, -0.012), vec2(0.058, 0.115)));
        d = min(d, lidSdSeg(pk, vec2(-0.018, 0.027), vec2(0.060, -0.115)));

        // 3 (center -0.206, balanced symmetric bowls meeting cleanly on y = 0.000 waist)
        vec2 p3 = lp - vec2(-0.206, 0.0);
        vec2 sc3 = vec2(0.8870, -0.4617); // half-angle 117.5 deg
        d = min(d, lidSdArc(p3, vec2(0.004, 0.058), vec2(0.8870, 0.4617), sc3, 0.058));
        d = min(d, lidSdArc(p3, vec2(0.004, -0.058), vec2(0.8870, -0.4617), sc3, 0.058));
        d = min(d, lidSdSeg(p3, vec2(-0.022, 0.000), vec2(0.004, 0.000)));

        // P (center -0.028)
        vec2 pp = lp - vec2(-0.028, 0.0);
        d = min(d, lidSdSeg(pp, vec2(-0.052, -0.115), vec2(-0.052, 0.115)));
        d = min(d, lidSdSeg(pp, vec2(-0.052, 0.115), vec2(0.008, 0.115)));
        d = min(d, lidSdSeg(pp, vec2(-0.052, -0.005), vec2(0.008, -0.005)));
        d = min(d, lidSdArc(pp, vec2(0.008, 0.055), vec2(1.0, 0.0), vec2(1.0, 0.0), 0.060));

        // T (center +0.170)
        vec2 pt = lp - vec2(0.170, 0.0);
        d = min(d, lidSdSeg(pt, vec2(0.0, -0.115), vec2(0.0, 0.115)));
        d = min(d, lidSdSeg(pt, vec2(-0.068, 0.115), vec2(0.068, 0.115)));

        // A (center +0.362)
        vec2 pa = lp - vec2(0.362, 0.0);
        d = min(d, lidSdSeg(pa, vec2(-0.066, -0.115), vec2(0.0, 0.115)));
        d = min(d, lidSdSeg(pa, vec2(0.066, -0.115), vec2(0.0, 0.115)));
        d = min(d, lidSdSeg(pa, vec2(-0.043, -0.036), vec2(0.043, -0.036)));

        return d;
      }

      void main() {
        vec3 N = normalize(vNormalView);
        vec3 V = normalize(vViewPos);
        vec3 L = normalize(uLightDir);

        float ndotv = abs(dot(N, V));
        float ndotl = dot(N, L);
        float rightBias = smoothstep(-0.85, 0.85, vShadePos.x);

        // 1. Crisp fine burin outer contour on vertical walls & rolled bead
        float sideWall = 1.0 - smoothstep(0.68, 0.92, abs(vNormalObj.y));
        float fwRim = max(fwidth(ndotv) * 1.15, 0.007);
        float silhouette = (1.0 - smoothstep(0.145 - fwRim, 0.145 + fwRim, ndotv)) * sideWall;

        // 2. Refined structural hairline pen contours along rolled lower lip, undercut shadow & bevel seams
        float fwY = max(fwidth(vLocalPos.y), 0.0018);
        float bottomLipEdge = (1.0 - smoothstep(0.0044, 0.0044 + fwY * 1.2, abs(vLocalPos.y - 1.062))) * 0.90;
        float undercutEdge = (1.0 - smoothstep(0.0052, 0.0052 + fwY * 1.2, abs(vLocalPos.y - 1.116))) * 0.92;
        float lidTopEdgeFade = mix(1.0, 0.55, uCompact);
        float shoulderEdge = (1.0 - smoothstep(0.0042, 0.0042 + fwY * 1.2, abs(vLocalPos.y - 1.305))) * 0.82 * lidTopEdgeFade;
        float bevelTopEdge = (1.0 - smoothstep(0.0042, 0.0042 + fwY * 1.2, abs(vLocalPos.y - 1.358))) * 0.88 * lidTopEdgeFade;

        // 3. Atelier 68-Flute Fine Copperplate Knurling (discrete 68->24 rib LOD in compact docks to prevent moiré shimmer)
        float isSkirt = smoothstep(1.118, 1.138, vLocalPos.y) * (1.0 - smoothstep(1.29, 1.32, vLocalPos.y));
        float angle = atan(vLocalPos.z, vLocalPos.x);
        float kPhase = angle * 68.0 / 6.2831853;
        float kPhaseComp = angle * 24.0 / 6.2831853;
        float lidFineLod = 1.0 - smoothstep(0.16, 0.56, uCompact);

        float grazingClamp = smoothstep(0.16, 0.34, ndotv);
        float fluteW = mix(0.022, 0.048, 1.0 - smoothstep(-0.2, 0.6, ndotl));
        float fluteHero = uCompact < 0.99 ? lidLine(kPhase + 0.5, fluteW, 1.0) : 0.0;
        float fluteComp = uCompact > 0.01 ? lidLine(kPhaseComp + 0.5, fluteW * 1.18, 1.0) : 0.0;
        float fluteBorder = isSkirt * mix(fluteHero, fluteComp, uCompact) * grazingClamp;

        float fluteTone = uIsLightMode > 0.5
          ? clamp(max(0.24, 1.0 - smoothstep(-0.25, 0.72, ndotl)) * (0.76 + 0.24 * (1.0 - rightBias)), 0.0, 1.0)
          : clamp(smoothstep(0.02, 0.70, ndotl) * (0.42 + 0.58 * rightBias), 0.0, 1.0);

        float ribCenterLine = isSkirt * lidLine(kPhase * 2.0, mix(0.018, 0.056, fluteTone), smoothstep(0.12, 0.42, fluteTone)) * grazingClamp * lidFineLod;
        float darkLeftCrest = (1.0 - uIsLightMode) * isSkirt *
                              lidLine(kPhase + 0.14, 0.028, smoothstep(-0.35, 0.12, ndotl) * (1.0 - rightBias)) *
                              grazingClamp * 0.68 * lidFineLod;
        ribCenterLine = max(ribCenterLine, darkLeftCrest);

        // Fine horizontal overhang shadow hairlines under top shoulder & above rolled bottom bead
        float overhangBand = smoothstep(1.272, 1.298, vLocalPos.y) * (1.0 - smoothstep(1.300, 1.308, vLocalPos.y));
        float baseBand = smoothstep(1.116, 1.124, vLocalPos.y) * (1.0 - smoothstep(1.138, 1.148, vLocalPos.y));
        float crossHatch = (overhangBand + baseBand) * lidLine(vLocalPos.y * 86.0, mix(0.018, 0.055, fluteTone), smoothstep(0.16, 0.62, fluteTone)) * grazingClamp * lidFineLod;

        // 4. Rolled lower lip & upper chamfer bevel: fine horizontal metallic engraving hairlines
        float r = length(vLocalPos.xz);
        float isBottom = (1.0 - smoothstep(-0.85, -0.55, vNormalObj.y)) * step(r, 0.80);
        float isBevel = smoothstep(1.305, 1.325, vLocalPos.y) * (1.0 - smoothstep(1.352, 1.365, vLocalPos.y));
        float isLip = smoothstep(1.062, 1.072, vLocalPos.y) * (1.0 - smoothstep(1.105, 1.115, vLocalPos.y)) * (1.0 - isBottom);
        float bevelTone = uIsLightMode > 0.5
          ? clamp(1.0 - smoothstep(-0.20, 0.55, ndotl), 0.0, 1.0)
          : clamp(smoothstep(0.18, 0.78, ndotl), 0.0, 1.0);
        float bevelHatch = (isBevel + isLip) * lidLine(vLocalPos.y * 92.0, mix(0.016, 0.048, bevelTone), smoothstep(0.20, 0.54, bevelTone)) * grazingClamp * lidFineLod;

        // 5. Lid Top Sealing Rings, Underside Seal & Spun-Metal Engraving Lines across ALL camera angles
        float isTop = smoothstep(0.55, 0.85, vNormalObj.y) * smoothstep(1.34, 1.36, vLocalPos.y);
        float fwR = max(fwidth(r), 0.0018);
        float stepRing = isTop * (1.0 - smoothstep(0.0044, 0.0044 + fwR * 1.2, abs(r - 0.678))) * 0.90;
        float beadRing = isTop * (1.0 - smoothstep(0.0044, 0.0044 + fwR * 1.2, abs(r - 0.755))) * 0.88;
        float bottomRim = isBottom * (1.0 - smoothstep(0.0048, 0.0048 + fwR * 1.2, abs(r - 0.755))) * 0.84;
        float bottomRings = isBottom * lidLine(r * 16.0, 0.026, mix(0.26, 0.72, 1.0 - bevelTone)) * lidFineLod * 0.68;

        // 6. Engraved "K3PTA" Brand Wordmark on Lid Dome (chiseled V-cut hero -> bold crisp stamped emblem at compact scale)
        vec2 lp = vec2(vLocalPos.x, -vLocalPos.z);
        float stampMix = smoothstep(0.06, 0.42, uCompact);
        float scaleInv = mix(1.0, 0.80, stampMix);
        vec2 lpBrand = lp * scaleInv;
        float brandPxH = (0.23 / scaleInv) / max(length(vec2(dFdx(lp.y), dFdy(lp.y))), 0.0005);
        float brandVis = mix(1.0, smoothstep(1.6, 3.0, brandPxH), smoothstep(0.0, 0.18, uCompact));
        float brandOutline = 0.0;
        float brandInnerHatch = 0.0;
        float brandReliefHatch = 0.0;
        float latheHalo = 1.0;

        if (brandVis > 0.005 && isTop > 0.04 && abs(lpBrand.x) < 0.58 && abs(lpBrand.y) < 0.25) {
          float brandDist = k3ptaSDF(lpBrand);
          float sw = mix(0.0205, 0.032, stampMix);
          float fwB = max(fwidth(brandDist), 0.0014);
          float brandMask = 1.0 - smoothstep(sw - fwB * 0.72, sw + fwB * 0.72, brandDist);

          // Clean negative-space breathing halo clearing background lathe rings around lettering
          latheHalo = mix(1.0, smoothstep(sw + 0.004, sw + 0.038, brandDist), brandVis);

          float hatchFade = (1.0 - stampMix) * brandVis;
          if (hatchFade > 0.005) {
            // Object-space stroke normal via tiny finite difference aligned with upper-right key light
            float gx = k3ptaSDF(lpBrand + vec2(0.004, 0.0)) - k3ptaSDF(lpBrand - vec2(0.004, 0.0));
            float gy = k3ptaSDF(lpBrand + vec2(0.0, 0.004)) - k3ptaSDF(lpBrand - vec2(0.0, 0.004));
            vec2 bGrad = normalize(vec2(gx, gy) + vec2(1e-5, 0.0));
            float bevelLit = clamp(0.50 + 0.50 * dot(bGrad, normalize(vec2(0.72, 0.69))), 0.0, 1.0);

            // Chiseled V-cut bevel rim around every stroke
            float rimLine = 1.0 - smoothstep(0.0022, 0.0022 + fwB * 1.15, abs(brandDist - sw));
            brandOutline = isTop * rimLine * mix(0.76, 0.96, bevelLit) * hatchFade;

            // Airy discrete diagonal copperplate hatching inside letter strokes
            float troughDepth = clamp((sw - brandDist) / sw, 0.0, 1.0);
            float hatchW = uIsLightMode > 0.5
              ? mix(0.13, 0.21, bevelLit * 0.55 + troughDepth * 0.45)
              : mix(0.19, 0.27, bevelLit * 0.60 + troughDepth * 0.40);
            float primaryH = lidLine(lpBrand.x * 64.0 + lpBrand.y * 54.0, hatchW, brandMask);
            float crossW = mix(0.11, 0.085, uIsLightMode) * clamp(1.0 - bevelLit * 0.72, 0.0, 1.0);
            float crossH = lidLine(lpBrand.x * 52.0 - lpBrand.y * 60.0, crossW, brandMask * troughDepth);
            brandInnerHatch = isTop * max(primaryH * 0.94, crossH * 0.84) * hatchFade;

            // Delicate lower-left atomic drop-relief hatching lifting lettering off lid plate
            float reliefDist = k3ptaSDF(lpBrand + vec2(0.015, 0.015));
            float outsideMask = smoothstep(sw + 0.005, sw + 0.012, brandDist);
            float reliefBand = (1.0 - smoothstep(sw + 0.006, sw + 0.031, reliefDist)) * outsideMask;
            float reliefAlpha = mix(0.42, 0.84, uIsLightMode);
            brandReliefHatch = isTop * lidLine(lpBrand.x * 66.0 - lpBrand.y * 66.0, mix(0.16, 0.14, uIsLightMode), step(0.001, reliefBand)) * reliefBand * reliefAlpha * hatchFade;
          }

          float brandStamped = isTop * brandMask * stampMix * brandVis * 0.96;
          brandOutline = max(brandOutline, brandStamped);
        }

        // Crisp dot-free brushed spun-metal concentric lathe rings (mask applied AFTER lidLine to avoid sub-threshold specks)
        float topLightAngle = smoothstep(-0.75, 0.85, vShadePos.x * 0.78 - vShadePos.z * 0.52);
        float topRingMask = uIsLightMode > 0.5
          ? mix(0.16, 0.90, 1.0 - topLightAngle) * step(r, 0.675) * latheHalo
          : mix(0.16, 0.86, topLightAngle) * step(r, 0.675) * latheHalo;
        float ringCoord = r * 22.0;
        float nyqRing = 1.0 - smoothstep(0.48, 0.76, fwidth(ringCoord));
        float topEngraving = isTop * lidLine(ringCoord, 0.028, step(r, 0.675)) * topRingMask * nyqRing * lidFineLod * 0.86;

        float ink = clamp(
          max(silhouette,
            max(bottomLipEdge,
              max(undercutEdge,
                max(shoulderEdge,
                  max(bevelTopEdge,
                    max(fluteBorder,
                      max(ribCenterLine,
                        max(crossHatch,
                          max(bevelHatch,
                            max(stepRing,
                              max(beadRing,
                                max(bottomRim,
                                  max(bottomRings,
                                    max(topEngraving,
                                      max(brandOutline, max(brandInnerHatch, brandReliefHatch)))))))))))))))),
          0.0,
          1.0
        );
        vec3 color = mix(uFillColor, uInkColor, ink);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

/**
 * 3D Deep Rankine Water Vortex Cylinder & Surface Wave Shader:
 * Deep steep-walled central funnel cylinder, readable traveling surface ripples without rushed spin,
 * and branch-cut-free logarithmic burin engraving across Dark & White modes.
 */
function createVortexSurfaceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInkColor: { value: new THREE.Color('#ffffff') },
      uLightDir: { value: new THREE.Vector3(0.55, 0.72, 0.52).normalize() },
      uIsLightMode: { value: 0.0 },
      uTime: { value: 0 },
      uSpeed: { value: 0.6 },
      uOrbitYaw: { value: 0.0 },
      uCompact: { value: 0.0 },
      uFreeOrbit: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uOrbitYaw;
      uniform float uFreeOrbit;

      varying vec2 vPosXZ;
      varying vec2 vShadeXZ;
      varying float vRadius;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying float vWaveCrest;
      varying float vViewPitch;

      float vortexGrowth(float spd) {
        float fadeIn = smoothstep(0.0, 0.14, spd);
        float normSpd = clamp(spd / 2.15, 0.0, 1.12);
        return fadeIn * pow(max(normSpd, 0.0001), 0.48);
      }

      float vortexHeight(vec2 xz) {
        float r = length(xz);
        float angle = atan(xz.y, xz.x);
        float rSafe = max(r, 0.0025);
        // Proportionally grow steeply tapered Rankine needle vortex depth & trumpet width across Still -> Drehen -> Schnell
        float growth = vortexGrowth(uSpeed);
        float amp = 0.340 * growth;

        float rOuter = mix(0.35, 0.48, growth);
        float rMid = mix(0.115, 0.168, growth);
        float rNeedle = mix(0.030, 0.046, growth);
        float outerDraw = 0.24 / (1.0 + pow(rSafe / rOuter, 1.9));
        float midCore = 0.42 / (1.0 + pow(rSafe / rMid, 1.85));
        float needleCusp = 0.34 * exp(-rSafe / rNeedle);
        float funnel = amp * (outerDraw + midCore + needleCusp);

        // Capillary climb at glass wall + surface waves proportional to active rotation (mirror-calm at uSpeed = 0)
        float rimBand = smoothstep(0.86, 1.016, r);
        float capClimb = 0.014 * rimBand;
        float wavePresence = smoothstep(0.0, 0.14, uSpeed) * mix(0.62, 1.15, growth);
        float rimLap = sin(angle * 3.0 - uTime * 1.12) * 0.0032 * smoothstep(0.86, 0.96, r) * (1.0 - smoothstep(0.97, 1.014, r)) * wavePresence;

        // Traveling spiral & Kelvin capillary swells across outer shelf & funnel shoulder
        float surfEnv = smoothstep(0.16, 0.36, r) * (1.0 - smoothstep(0.68, 0.89, r));
        float surfSwell1 = sin(angle * 3.0 - r * 9.5 - uTime * 1.20) * 0.0155 * surfEnv;
        float surfSwell2 = sin(angle * 5.0 - r * 15.0 - uTime * 1.62) * 0.0070 * smoothstep(0.22, 0.46, r) * (1.0 - smoothstep(0.70, 0.89, r));
        return capClimb + rimLap - funnel + (surfSwell1 + surfSwell2) * wavePresence;
      }

      void main() {
        vec3 p = position;
        p.y += vortexHeight(p.xz);

        float e = 0.0045;
        float hL = vortexHeight(p.xz - vec2(e, 0.0));
        float hR = vortexHeight(p.xz + vec2(e, 0.0));
        float hD = vortexHeight(p.xz - vec2(0.0, e));
        float hU = vortexHeight(p.xz + vec2(0.0, e));
        vec3 nObj = normalize(vec3(hL - hR, 2.0 * e, hD - hU));

        float r = length(p.xz);
        float angle = atan(p.z, p.x);
        float waveSpin = smoothstep(0.0, 0.14, uSpeed);
        vWaveCrest = (0.5 + 0.5 * sin(angle * 3.0 - r * 9.5 - uTime * 1.20)) * waveSpin;

        vPosXZ = p.xz;
        vRadius = r;
        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        if (uFreeOrbit >= 0.5) {
          vec3 mvOrigin = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vShadeXZ = vec2(mvPos.x - mvOrigin.x, mvPos.z - mvOrigin.z);
        } else {
          float cy = cos(uOrbitYaw);
          float sy = sin(uOrbitYaw);
          vShadeXZ = vec2(p.x * cy - p.z * sy, p.x * sy + p.z * cy);
        }
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * nObj);
        vec3 upView = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        vec3 centerToCam = normalize(-(modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
        vViewPitch = abs(dot(centerToCam, upView));
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      uniform vec3 uLightDir;
      uniform float uIsLightMode;
      uniform float uTime;
      uniform float uSpeed;
      uniform float uCompact;

      varying vec2 vPosXZ;
      varying vec2 vShadeXZ;
      varying float vRadius;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying float vWaveCrest;
      varying float vViewPitch;

      float vortexGrowth(float spd) {
        float fadeIn = smoothstep(0.0, 0.14, spd);
        float normSpd = clamp(spd / 2.15, 0.0, 1.12);
        return fadeIn * pow(max(normSpd, 0.0001), 0.48);
      }

      float vortexBurinLineDF(float coord, float width, float mask, float df) {
        float w = clamp(width * mask, 0.0, 0.42);
        float present = smoothstep(0.002, 0.012, w);
        if (present <= 0.001) return 0.0;
        float f = abs(fract(coord) - 0.5);
        float minW = clamp(df * 0.36, 0.008, 0.18);
        float drawW = max(w, minW);
        float gain = clamp(w / max(drawW, 0.0001), 0.0, 1.0);
        float nyquist = 1.0 - smoothstep(0.38, 0.62, df);
        return (1.0 - smoothstep(max(drawW - df * 0.85, 0.0), min(drawW + df * 0.85, 0.5), f)) * gain * nyquist * present;
      }

      float vortexBurinLine(float coord, float width, float mask) {
        return vortexBurinLineDF(coord, width, mask, max(fwidth(coord), 0.002));
      }

      void main() {
        float r = vRadius;
        float angle = atan(vPosXZ.y, vPosXZ.x);
        float normX = vShadeXZ.x / max(r, 0.25);
        vec3 Nraw = normalize(vNormalView);
        vec3 V = normalize(vViewPos);
        vec3 L = normalize(uLightDir);
        float ndotv = abs(dot(Nraw, V));
        float ndotl = dot(Nraw, L);
        float growth = vortexGrowth(uSpeed);
        float activeSpin = smoothstep(0.0, 0.14, uSpeed);
        float inkIntensity = activeSpin * mix(0.74, 1.0, growth);
        float sideViewMask = 1.0 - smoothstep(0.22, 0.42, vViewPitch);
        float overheadMix = smoothstep(0.24, 0.46, vViewPitch);

        // Analytical screen-space polar gradients (eliminates atan branch-cut gaps along -X seam)
        vec2 gx = dFdx(vPosXZ);
        vec2 gy = dFdy(vPosXZ);
        float r2 = max(dot(vPosXZ, vPosXZ), 0.0025);
        float gradAngX = (gx.y * vPosXZ.x - gx.x * vPosXZ.y) / r2;
        float gradAngY = (gy.y * vPosXZ.x - gy.x * vPosXZ.y) / r2;
        float rSafe = max(r, 0.012);
        float gradRX = dot(vPosXZ, gx) / rSafe;
        float gradRY = dot(vPosXZ, gy) / rSafe;
        float fwR = max(length(vec2(gradRX, gradRY)), 0.0024);

        // 1. Exterior Submerged Rankine Funnel Wall (!gl_FrontFacing):
        // Renders the tapered pointed needle silhouette & grazing shadow-side helical wraps strictly in side view; dissolves cleanly overhead
        if (!gl_FrontFacing) {
          if (sideViewMask <= 0.01) discard;
          float extSpan = mix(0.36, 0.54, growth);
          float sideBias = 1.0 - smoothstep(0.08, 0.52, ndotv);
          float cylMask = smoothstep(0.009, 0.036, r) * (1.0 - smoothstep(0.18, extSpan, r)) * inkIntensity * sideViewMask;
          if (cylMask <= 0.01) discard;

          float needleProfile = (1.0 - smoothstep(0.03, 0.28, ndotv)) * cylMask * mix(0.90, 0.96, uIsLightMode);
          float extLight = uIsLightMode > 0.5
            ? clamp(0.42 + 0.54 * smoothstep(0.26, -0.40, normX), 0.0, 1.0)
            : clamp(0.28 + 0.68 * smoothstep(-0.32, 0.65, normX), 0.0, 1.0);
          float extSpecBreak = 1.0 - exp(-pow((normX - 0.34) / 0.22, 2.0)) * 0.85;
          float dLogE = 6.0 / (r + 0.034);
          float extHelixPhase = (log(r + 0.034) * 6.0 + angle * 2.0 - uTime * 1.15) / 6.2831853;
          float dfExt = clamp(length(vec2(2.0 * gradAngX + dLogE * gradRX, 2.0 * gradAngY + dLogE * gradRY)) / 6.2831853, 0.002, 1.5);
          float extW = mix(0.014, 0.044, extLight) * sideBias * extSpecBreak;
          float extHelix = vortexBurinLineDF(extHelixPhase, extW, cylMask * sideBias * extSpecBreak, dfExt) * 0.78;

          float extAlpha = clamp(max(needleProfile, extHelix), 0.0, 0.92);
          if (extAlpha < 0.025) discard;
          gl_FragColor = vec4(uInkColor, extAlpha);
          return;
        }

        // 2. Front / Top Concave Liquid Meniscus & Plunged Funnel Interior (gl_FrontFacing)
        float menSpecBreak = 1.0 - exp(-pow((normX - 0.58) / 0.12, 2.0)) * step(-0.2, vShadeXZ.y) * 0.54;
        float outerHalfW = (mix(mix(0.0080, 0.0058, uIsLightMode), mix(0.0036, 0.0028, uIsLightMode), smoothstep(-0.75, 0.75, vShadeXZ.x)) + 0.0042 * uCompact) * menSpecBreak;
        float outerMeniscus = (1.0 - smoothstep(outerHalfW, outerHalfW + fwR * 1.15, abs(r - 1.004))) * 0.95;

        float vortexFineLod = 1.0 - smoothstep(0.15, 0.55, uCompact);
        float innerWaveMod = mix(0.62, 1.0, mix(0.75, vWaveCrest, activeSpin));
        float innerBreak = smoothstep(0.10, 0.48, abs(sin(angle * 2.0 - uTime * 0.85 + 0.6))) *
                           (1.0 - smoothstep(0.35, 0.85, normX) * 0.58);
        float innerW = mix(0.0024, 0.0017, uIsLightMode);
        float innerAlpha = mix(0.64, 0.88, uIsLightMode);
        float innerMeniscus = (1.0 - smoothstep(innerW, innerW + fwR * 1.15, abs(r - 0.972))) * innerBreak * innerWaveMod * innerAlpha * vortexFineLod;

        // Delicate asymmetric drypoint surface glints appear as water settles into Still (crisp ink in Light Mode)
        float restCalmMix = 1.0 - smoothstep(0.02, 0.30, growth);
        float calmW1 = mix(0.0018, 0.0013, uIsLightMode);
        float calmW2 = mix(0.0015, 0.0011, uIsLightMode);
        float calmArc1 = (1.0 - smoothstep(calmW1, calmW1 + fwR * 1.1, abs(r - 0.76))) *
                         smoothstep(0.28, 0.78, sin(angle * 2.0 + 0.85));
        float calmArc2 = (1.0 - smoothstep(calmW2, calmW2 + fwR * 1.1, abs(r - 0.54))) *
                         smoothstep(0.36, 0.84, cos(angle * 2.0 - 0.45));
        float calmRing = max(calmArc1, calmArc2 * 0.85) * restCalmMix * mix(0.42, 0.84, uIsLightMode);

        // Non-concentric 2-start logarithmic helical burin lines spiraling down into the Rankine needle tip
        float funnelOuterSpan = mix(0.34, 0.52, growth);
        float rInnerCut = mix(0.016, 0.056, overheadMix);
        float funnelWallMask = smoothstep(rInnerCut, rInnerCut + mix(0.036, 0.068, overheadMix), r) * (1.0 - smoothstep(0.22, funnelOuterSpan, r)) * inkIntensity;
        float concaveTone = uIsLightMode > 0.5
          ? clamp(0.42 + 0.46 * smoothstep(0.38, 0.04, r) + 0.36 * (1.0 - smoothstep(0.36, 0.84, ndotl)), 0.0, 1.0)
          : clamp(0.22 + smoothstep(0.02, 0.76, ndotl) * 0.78, 0.0, 1.0);
        float specBreak = 1.0 - exp(-pow((normX - 0.36) / 0.24, 2.0)) * 0.78;
        float dLogH = 5.4 / (r + 0.052);
        float helixPhase = (log(r + 0.052) * 5.4 + angle * 2.0 - uTime * 1.18) / 6.2831853;
        float dfHelix = clamp(length(vec2(2.0 * gradAngX + dLogH * gradRX, 2.0 * gradAngY + dLogH * gradRY)) / 6.2831853, 0.002, 1.5);
        float helixBaseW = mix(0.014, 0.048, smoothstep(0.18, 0.88, concaveTone));
        float helixW = mix(helixBaseW, mix(0.011, 0.032, smoothstep(0.18, 0.88, concaveTone)), overheadMix) * mix(0.45, 1.0, specBreak);
        float helixAlpha = uIsLightMode > 0.5 ? mix(0.92, 0.78, overheadMix) : mix(0.86, 0.64, overheadMix);
        float funnelHelix = vortexBurinLineDF(helixPhase, helixW, funnelWallMask * mix(0.34, 1.0, specBreak), dfHelix) * helixAlpha;

        // Subtle, light-modulated concave funnel depth contours strictly for 3D overhead bowl cohesion (zero radar bullseye)
        float bowlSpan = mix(0.34, 0.50, growth);
        float bowlMask = smoothstep(0.052, 0.115, r) * (1.0 - smoothstep(0.22, bowlSpan, r)) * inkIntensity * overheadMix;
        float bowlFreq = mix(20.0, 24.0, growth);
        float bowlCoord = r * bowlFreq + sin(angle * 2.0 - uTime * 0.90) * 0.14 - uTime * 0.20;
        vec2 dBowl = bowlFreq * vec2(gradRX, gradRY) + (0.28 * cos(angle * 2.0 - uTime * 0.90)) * vec2(gradAngX, gradAngY);
        float bowlShadeBreak = smoothstep(0.14, 0.78, 0.52 + 0.48 * ndotl) * mix(0.24, 1.0, specBreak);
        float bowlContours = vortexBurinLineDF(bowlCoord, mix(0.010, 0.024, bowlShadeBreak), bowlMask * bowlShadeBreak, clamp(length(dBowl), 0.002, 1.5)) * mix(0.46, 0.58, uIsLightMode) * mix(1.0, 0.55, uCompact);

        // Tapered 4-Arm Calligraphic Streamlines (broken feather-weight ink tails aligned with rotating current)
        float spMask = smoothstep(mix(0.024, 0.072, overheadMix), 0.145, r) * (1.0 - smoothstep(0.58, 0.84, r)) * inkIntensity;
        float spDash = smoothstep(-0.15, 0.62, sin(angle * 4.0 + r * 6.5 - uTime * 1.05)) *
                       smoothstep(0.12, 0.72, abs(cos(angle * 2.0 - r * 3.5 + 0.4)));
        float spPhase = (angle * 4.0 + log(r + 0.085) * 7.8 - uTime * 1.28) / 6.2831853;
        float dLogK = 7.8 / (r + 0.085);
        float dfSp = clamp(length(vec2(4.0 * gradAngX + dLogK * gradRX, 4.0 * gradAngY + dLogK * gradRY)) / 6.2831853, 0.002, 1.5);
        float spW = mix(0.007, mix(0.042, 0.032, overheadMix), spDash) * mix(0.55, 1.0, smoothstep(0.50, 0.08, r)) * (0.68 + 0.32 * concaveTone);
        float spAlpha = uIsLightMode > 0.5 ? mix(0.92, 0.82, overheadMix) : mix(0.88, 0.70, overheadMix);
        float spiralLines = vortexBurinLineDF(spPhase, spW, pow(spMask, 0.75) * mix(0.28, 1.0, spDash), dfSp) * spAlpha * mix(1.0, 0.58, uCompact);

        // Broken 3-Armed Spiral Kelvin Wave-Crest Glints across outer water shelf
        float outerWaveMask = smoothstep(mix(0.26, 0.34, growth), 0.44, r) * (1.0 - smoothstep(0.76, 0.92, r)) * inkIntensity;
        float waveFrontCoord = r * 9.5 - angle * 0.47746483 + sin(angle * 3.0 - uTime * 1.20) * 0.42 - uTime * 0.44;
        vec2 dWave = 9.5 * vec2(gradRX, gradRY) +
                     (-0.47746483 + 1.26 * cos(angle * 3.0 - uTime * 1.20)) * vec2(gradAngX, gradAngY);
        float dfWave = clamp(length(dWave), 0.002, 1.5);
        float waveCrestFocus = smoothstep(0.36, 0.92, vWaveCrest) * smoothstep(0.02, 0.78, ndotl * 0.65 + 0.35);
        float outerWaveArcs = vortexBurinLineDF(waveFrontCoord, mix(0.010, 0.034, waveCrestFocus), outerWaveMask * waveCrestFocus, dfWave) * mix(0.82, 0.90, uIsLightMode);

        float strokeAlpha = clamp(
          max(outerMeniscus, max(innerMeniscus, max(calmRing, max(funnelHelix, max(bowlContours, max(spiralLines, outerWaveArcs)))))),
          0.0,
          0.96
        );

        // Smooth Gaussian liquid basin depth veil across the active funnel so water cleanly separates in front of cortex without a blotchy core stain
        float funnelRad = mix(0.28, 0.42, growth);
        float coreField = exp(-pow(r / funnelRad, 1.85)) * inkIntensity;
        float veilPeak = uIsLightMode > 0.5
          ? mix(0.24, 0.34, smoothstep(0.18, 0.82, concaveTone))
          : mix(0.20, 0.34, 1.0 - concaveTone * 0.62);
        float veilAlpha = coreField * veilPeak;
        vec3 veilColor = uIsLightMode > 0.5 ? vec3(0.985) : vec3(0.065);

        float outAlpha = strokeAlpha + veilAlpha * (1.0 - strokeAlpha);
        if (outAlpha < 0.02) discard;
        vec3 outColor = (uInkColor * strokeAlpha + veilColor * veilAlpha * (1.0 - strokeAlpha)) / max(outAlpha, 0.0001);
        gl_FragColor = vec4(outColor, outAlpha);
      }
    `,
  });
}

/**
 * Hand-Inked Hairline Spherical Air Bubbles Shader:
 * Visibly advected along calm swirling Rankine streamlines without rushing or shrinking into dust specks.
 */
function createBubblesMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInkColor: { value: new THREE.Color('#ffffff') },
      uIsLightMode: { value: 0.0 },
      uTime: { value: 0 },
      uSpeed: { value: 0.6 },
      uCompact: { value: 0.0 },
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aBubbleSeed; // x: angle0, y: baseR, z: phase0, w: sizeNorm

      uniform float uTime;
      uniform float uSpeed;

      varying vec2 vUv;
      varying float vSizeNorm;
      varying float vCortexDodge;
      varying float vAlphaFade;

      void main() {
        // Stokes buoyancy: calm, unhurried rise across the liquid column
        float riseSpeed = 0.018 + 0.014 * aBubbleSeed.w;
        float rise = fract(aBubbleSeed.z + uTime * riseSpeed);

        // Graceful Rankine vortex suction pull around funnel collar without rushing or clipping inside throat
        float activeFlow = smoothstep(0.0, 0.20, uSpeed);
        float prelimY = mix(-1.15, 0.46, rise);
        float brainEllipMask = exp(-pow((prelimY + 0.415) / 0.48, 2.0));
        float vortexPull = smoothstep(0.58, 0.98, rise) * 0.30 * activeFlow;
        float rMin = mix(0.32, 0.82, brainEllipMask);
        float r = clamp(mix(aBubbleSeed.y, 0.84, brainEllipMask * 0.58) - vortexPull, rMin, 0.865);
        float heelTaper = smoothstep(-0.95, -1.16, prelimY);
        r = min(r, mix(0.865, 0.68, heelTaper));

        // Match the speed-responsive Rankine needle vortex dip so bubbles stay strictly inside the liquid column
        float rSafe = max(r, 0.12);
        float growth = smoothstep(0.0, 0.14, uSpeed) * pow(max(clamp(uSpeed / 2.15, 0.0, 1.12), 0.0001), 0.48);
        float rOuter = mix(0.35, 0.48, growth);
        float rMid = mix(0.115, 0.168, growth);
        float rNeedle = mix(0.030, 0.046, growth);
        float surfaceDip = 0.340 * growth * (
          0.24 / (1.0 + pow(rSafe / rOuter, 1.9)) +
          0.42 / (1.0 + pow(rSafe / rMid, 1.85)) +
          0.34 * exp(-rSafe / rNeedle)
        );
        float y = mix(-1.15, 0.478 - surfaceDip, rise);

        // Serene swirling fluid current aligned clockwise with surface streamlines
        float sway = sin(rise * 9.0 + aBubbleSeed.x * 5.0 + uTime * 0.28) * 0.016 * (1.0 - vortexPull);
        float omega = (0.13 + 0.10 / (r + 0.40)) * (0.82 + 0.20 * vortexPull);
        float theta = aBubbleSeed.x + uTime * omega + vortexPull * 0.45;
        vec3 bubblePos = vec3(cos(theta) * (r + sway), y, sin(theta) * (r - sway * 0.6));

        // Attenuate foreground bubbles directly crossing central cortical sulci in live camera view space
        vec4 mvCenter = modelViewMatrix * vec4(bubblePos, 1.0);
        vec4 mvBrain = modelViewMatrix * vec4(0.0, -0.415, 0.0, 1.0);
        vec3 relMV = mvCenter.xyz - mvBrain.xyz;
        float viewOverlap = 1.0 - smoothstep(0.22, 0.68, length(vec2(relMV.x / 0.66, relMV.y / 0.48)));
        vCortexDodge = viewOverlap * step(0.0, relMV.z);

        // Opacity taper at birth & surface (NO tiny dust speck shrinkage!)
        vAlphaFade = smoothstep(0.0, 0.11, rise) * (1.0 - smoothstep(0.86, 1.0, rise));
        float bubbleRadius = mix(0.020, 0.043, aBubbleSeed.w) * (0.90 + 0.16 * rise);
        mvCenter.xy += position.xy * bubbleRadius * 2.5;

        vUv = position.xy * 2.5;
        vSizeNorm = aBubbleSeed.w;
        gl_Position = projectionMatrix * mvCenter;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIsLightMode;
      uniform vec3 uInkColor;
      uniform float uCompact;

      varying vec2 vUv;
      varying float vSizeNorm;
      varying float vCortexDodge;
      varying float vAlphaFade;

      void main() {
        float compactVis = mix(1.0, smoothstep(0.28, 0.58, vSizeNorm), uCompact);
        if (compactVis <= 0.02) discard;
        float d = length(vUv);
        if (d > 1.24 || vAlphaFade < 0.08) discard;
        vec2 dir = vUv / max(d, 0.001);
        vec2 L = normalize(vec2(0.58, 0.74));
        float lit = dot(dir, L);
        float fw = max(fwidth(d), 0.036 + 0.018 * uCompact);

        // Delicate copperplate hairline outline (slim nib weight—scaled slightly in compact docks for crisp circular readability)
        float ringHW = (uIsLightMode > 0.5
          ? mix(0.082, 0.032, smoothstep(-0.55, 0.85, lit))
          : mix(0.036, 0.070, smoothstep(0.10, 0.90, lit))) + 0.032 * uCompact;
        float arcBreak = uIsLightMode > 0.5
          ? smoothstep(-0.92, 0.98, 1.0 - max(0.0, lit - 0.48) * 0.58)
          : mix(0.56, 1.0, smoothstep(-0.35, 0.70, lit));
        float outerRing = (1.0 - smoothstep(ringHW - fw, ringHW + fw, abs(d - 0.72))) * arcBreak;

        // Crisp tiny internal top-right highlight flick restricted strictly to largest 30% hero bubbles
        float hasSpec = smoothstep(0.54, 0.76, vSizeNorm);
        float specDist = abs(d - 0.34);
        float specArc = hasSpec * smoothstep(0.58, 0.88, lit) * (1.0 - smoothstep(0.036 - fw * 0.7, 0.036 + fw * 0.7, specDist));

        float dodge = mix(0.92, 0.28, vCortexDodge) * vAlphaFade * compactVis;
        float inkAlpha = max(outerRing * dodge, specArc * dodge * 0.95);
        if (inkAlpha < 0.04) discard;
        gl_FragColor = vec4(uInkColor, inkAlpha);
      }
    `,
  });
}

function buildBubblesMesh(material, count = 36) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(count * 4);
  const goldenAngle = 2.39996323;
  for (let i = 0; i < count; i++) {
    const h1 = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
    const h2 = Math.abs(Math.sin((i + 1) * 78.233) * 19341.123) % 1;
    const h3 = Math.abs(Math.sin((i + 1) * 41.517) * 29873.713) % 1;
    // Stratified azimuthal & radial distribution avoids close colliding bubble doublets
    seeds[i * 4] = i * goldenAngle + (h1 - 0.5) * 0.18;
    seeds[i * 4 + 1] = 0.56 + ((i % 5) / 4) * 0.24 + (h2 - 0.5) * 0.04;
    seeds[i * 4 + 2] = (i / count + (h3 - 0.5) * 0.04 + 1.0) % 1.0;
    seeds[i * 4 + 3] = Math.pow(h1 * 0.7 + h3 * 0.3, 1.35);
  }
  geo.setAttribute('aBubbleSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

export const SPEED_MODES = {
  still: { id: 'still', label: 'Still', speed: 0.0 },
  drehen: { id: 'drehen', label: 'Drehen', speed: 0.65 },
  schnell: { id: 'schnell', label: 'Schnell drehen', speed: 2.15 },
};

export const ACTIVITY_SPEED_MAP = {
  idle: 'still',
  ready: 'still',
  still: 'still',
  active: 'drehen',
  listening: 'drehen',
  syncing: 'drehen',
  drehen: 'drehen',
  thinking: 'schnell',
  processing: 'schnell',
  indexing: 'schnell',
  schnell: 'schnell',
};

const VIEW_PRESETS = {
  default: { yaw: 0.0, pitch: 0.135, roll: 0.0, dist: 6.38, targetY: -0.04 },
  dock: { yaw: -0.16, pitch: 0.64, roll: -0.30, dist: 7.55, targetY: -0.02, fitRadius: 1.62, fitFill: 0.84 },
  float: { yaw: -0.16, pitch: 0.56, roll: -0.22, dist: 7.55, targetY: -0.02, fitRadius: 1.62, fitFill: 0.84 },
  vortex: { yaw: 0.22, pitch: 0.64, roll: 0.0, dist: 7.1, targetY: -0.04 },
  profile: { yaw: 1.18, pitch: 0.15, roll: 0.0, dist: 6.45, targetY: -0.04 },
  base: { yaw: -0.46, pitch: -0.34, roll: 0.0, dist: 6.65, targetY: -0.06 },
};

export const K3PTA_SIDEBAR_PALETTES = {
  light: {
    ink: '#1f1e1c',
    brainFill: '#1f1e1c',
    brainLine: '#eae9e4',
    lidFill: '#fafaf9',
    shadow: '#1f1e1c',
  },
  dark: {
    ink: '#eaeae8',
    brainFill: '#eaeae8',
    brainLine: '#060607',
    lidFill: '#252526',
    shadow: '#060607',
  },
};

function clampValue(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Main embeddable 3D Brain-in-a-Jar widget controller.
 */
export class BrainJarWidget {
  constructor(hostEl, options = {}) {
    if (!hostEl) {
      throw new Error('BrainJarWidget requires a valid DOM host element.');
    }
    this.hostEl = hostEl;
    const preset = VIEW_PRESETS[options.initialView] || VIEW_PRESETS.default;

    this.respectReducedMotion = options.respectReducedMotion ?? true;
    const prefersReducedMotion =
      this.respectReducedMotion &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const activityMappedMode =
      options.activityState && ACTIVITY_SPEED_MAP[options.activityState]
        ? ACTIVITY_SPEED_MAP[options.activityState]
        : null;
    const initMode = SPEED_MODES[options.speedMode]
      ? options.speedMode
      : activityMappedMode || (prefersReducedMotion ? 'still' : 'drehen');
    this.speedMode = initMode;
    this.activityState = options.activityState || initMode;
    this.isPaused = Boolean(options.paused);
    this.isSuspended = Boolean(options.suspended);
    this.rotationSpeed = typeof options.speed === 'number' ? options.speed : SPEED_MODES[initMode].speed;
    this.currentSpeed = this.isPaused ? 0.0 : this.rotationSpeed;
    this.swirlTime = 0;
    this.bubbleTime = 0;
    this.syncDocumentTheme = options.syncDocumentTheme ?? true;

    this.enableDrag = options.enableDrag ?? true;
    this.enableZoom = options.enableZoom ?? true;
    this.enableClickCycle = options.enableClickCycle ?? true;
    this.enableHoverTilt = options.enableHoverTilt ?? true;
    this.showBaseShadow = options.showBaseShadow ?? true;
    this.freeOrbit = Boolean(options.freeOrbit);
    this.maxPixelRatio = typeof options.maxPixelRatio === 'number' ? Math.max(1, options.maxPixelRatio) : 3;
    this.pauseWhenHidden = options.pauseWhenHidden ?? true;
    this.idleSleep = options.idleSleep ?? true;
    this.forceContextLossOnDispose = Boolean(options.forceContextLossOnDispose);

    this.orbitYaw = preset.yaw;
    this.orbitPitch = preset.pitch;
    this.orbitRoll = preset.roll || 0;
    this.orbitDist = preset.dist;
    this.targetY = preset.targetY;
    this.fitRadius = preset.fitRadius || 0;
    this.fitFill = preset.fitFill || 0.84;
    this.targetYaw = this.orbitYaw;
    this.targetPitch = this.orbitPitch;
    this.targetRoll = this.orbitRoll;
    this.targetDist = this.orbitDist;
    this.targetLookY = this.targetY;

    this.velYaw = 0;
    this.velPitch = 0;
    this._lastDragTime = 0;
    this._dragSensYaw = 0.0085;
    this._dragSensPitch = 0.0065;
    this._flickVelYaw = 0;
    this._flickVelPitch = 0;

    this._tmpEuler = new THREE.Euler(-this.orbitPitch, this.orbitYaw, this.orbitRoll, 'YXZ');
    this._effQuat = new THREE.Quaternion().setFromEuler(this._tmpEuler);
    this._offsetVec = new THREE.Vector3();
    this._upVec = new THREE.Vector3();

    this.isDragging = false;
    this.activePointerId = null;
    this.pointerDownPos = { x: 0, y: 0 };
    this.dragLast = { x: 0, y: 0 };
    this.dragMoved = false;
    this.pointerTarget = { x: 0, y: 0 };
    this.pointerCurrent = { x: 0, y: 0 };
    this.defaultView = VIEW_PRESETS[options.initialView] ? options.initialView : 'default';
    this.activeView = this.defaultView;
    this.onViewChange = typeof options.onViewChange === 'function' ? options.onViewChange : null;
    this.onSpeedModeChange = typeof options.onSpeedModeChange === 'function' ? options.onSpeedModeChange : null;
    this.onModelClick = typeof options.onModelClick === 'function' ? options.onModelClick : null;
    this.onContextLost = typeof options.onContextLost === 'function' ? options.onContextLost : null;
    this.onContextRestored = typeof options.onContextRestored === 'function' ? options.onContextRestored : null;
    this.raycaster = new THREE.Raycaster();
    this.ndcPointer = new THREE.Vector2();
    this.hitTargets = [];
    this.modeBeforeLastClick = null;
    this.lastModelClickTime = 0;
    this.rafId = null;
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.isInViewport = true;
    this.isDocVisible = typeof document === 'undefined' ? true : !document.hidden;
    this.isContextLost = false;
    this.customPalette = options.palette || null;
    this.isDisposed = false;

    this.scene = new THREE.Scene();

    const width = hostEl.clientWidth || 460;
    const height = hostEl.clientHeight || 540;
    this.camera = new THREE.PerspectiveCamera(29, width / height, 0.1, 50);

    if (
      typeof window !== 'undefined' &&
      typeof window.WebGLRenderingContext === 'undefined' &&
      typeof window.WebGL2RenderingContext === 'undefined' &&
      typeof navigator !== 'undefined' &&
      /jsdom/i.test(navigator.userAgent || '')
    ) {
      throw new Error('WebGL unavailable in jsdom');
    }

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(width, height);
    const canvas = this.renderer.domElement;
    canvas.className = 'brain-jar-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.background = 'transparent';
    this.hostEl.style.touchAction = this.enableDrag ? 'none' : 'pan-y';
    if (this.enableDrag) {
      this.hostEl.style.cursor = 'grab';
    }
    this.hostEl.appendChild(canvas);

    // Master 3D Jar Assembly (allows subtle interactive hover tilt)
    this.jarAssembly = new THREE.Group();
    this.scene.add(this.jarAssembly);

    // 0. Grounded Copperplate Stipple Contact Shadow beneath jar base (renderOrder -1)
    const baseShadowGeo = new THREE.CircleGeometry(1.18, 64);
    baseShadowGeo.rotateX(-Math.PI / 2);
    this.baseShadowMat = createBaseShadowMaterial();
    const baseShadowMesh = new THREE.Mesh(baseShadowGeo, this.baseShadowMat);
    baseShadowMesh.position.y = -1.445;
    baseShadowMesh.renderOrder = -1;
    baseShadowMesh.visible = this.showBaseShadow;
    this.baseShadowMesh = baseShadowMesh;
    this.jarAssembly.add(baseShadowMesh);

    // 1. Back Glass Wall + Dedicated 3D Inner Base Punt Basin (renderOrder 0)
    const jarGeo = buildJarGeometry();
    this.glassBackMat = createGlassMaterial(false);
    const jarBackMesh = new THREE.Mesh(jarGeo, this.glassBackMat);
    jarBackMesh.renderOrder = 0;
    this.jarAssembly.add(jarBackMesh);

    this.basePuntMat = createBasePuntMaterial();
    const basePuntMesh = new THREE.Mesh(buildBasePuntGeometry(), this.basePuntMat);
    basePuntMesh.renderOrder = 0;
    this.jarAssembly.add(basePuntMesh);

    // 2. Detailed 3D Brain Assembly (real human L:W:H proportions scaled cleanly inside liquid envelope)
    this.brainMat = createBrainInkMaterial();
    this.brainGroup = this.createBrainAssembly();
    this.brainGroup.position.set(0, -0.415, 0);
    this.brainGroup.scale.setScalar(0.56);
    this.jarAssembly.add(this.brainGroup);

    // 3. 3D Deep Rankine Water Vortex Cylinder + Serene Flowing Air Bubbles (renderOrder 2)
    const discGeo = this.createSubdividedDisc(1.016, 112, 64);
    this.vortexMat = createVortexSurfaceMaterial();
    const vortexDiscMesh = new THREE.Mesh(discGeo, this.vortexMat);
    vortexDiscMesh.position.y = 0.495;
    vortexDiscMesh.renderOrder = 2;
    this.jarAssembly.add(vortexDiscMesh);

    this.bubblesMat = createBubblesMaterial();
    const bubblesMesh = buildBubblesMesh(this.bubblesMat, 36);
    this.jarAssembly.add(bubblesMesh);

    // 4. Front Outer Glass Wall (renderOrder 4)
    this.glassFrontMat = createGlassMaterial(true);
    const jarFrontMesh = new THREE.Mesh(jarGeo, this.glassFrontMat);
    jarFrontMesh.renderOrder = 4;
    this.jarAssembly.add(jarFrontMesh);

    // 6. 3D Screw Lid (renderOrder 5, opaque cap)
    this.lidMat = createLidMaterial();
    const lidMesh = new THREE.Mesh(buildLidGeometry(), this.lidMat);
    lidMesh.renderOrder = 5;
    this.jarAssembly.add(lidMesh);

    // 7. Invisible fast-raycast hit volume covering jar body, lid & brain silhouette for instant model clicks
    const hitProxyMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const hitBodyProxy = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 2.35, 24), hitProxyMat);
    hitBodyProxy.position.y = -0.25;
    hitBodyProxy.renderOrder = 10;
    const hitLidProxy = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.62, 24), hitProxyMat);
    hitLidProxy.position.y = 1.14;
    hitLidProxy.renderOrder = 10;
    this.jarAssembly.add(hitBodyProxy, hitLidProxy);
    this.hitTargets = [hitBodyProxy, hitLidProxy];

    this.currentTheme = options.theme === 'light' ? 'light' : 'dark';
    this.needsRender = true;
    this.hasWheelListener = false;

    this.clock = new THREE.Clock();
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleContextLost = this.handleContextLost.bind(this);
    this.handleContextRestored = this.handleContextRestored.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handleDragMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.hostEl.addEventListener('pointerdown', this.handlePointerDown);
    this.hostEl.addEventListener('pointermove', this.handlePointerMove);
    this.hostEl.addEventListener('pointerup', this.handlePointerUp);
    this.hostEl.addEventListener('pointercancel', this.handlePointerUp);
    this.hostEl.addEventListener('pointerleave', this.handlePointerLeave);
    this.hostEl.addEventListener('dblclick', this.handleDoubleClick);
    this.setZoomEnabled(this.enableZoom);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.hostEl);
    }

    if (this.pauseWhenHidden && typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          const nextVisible = entry ? entry.isIntersecting || entry.intersectionRatio > 0 : true;
          if (nextVisible !== this.isInViewport) {
            this.isInViewport = nextVisible;
            if (nextVisible) {
              this.wakeRender();
            }
          }
        },
        { threshold: 0.01 }
      );
      this.intersectionObserver.observe(this.hostEl);
    }

    if (options.theme === 'light' || options.theme === 'dark') {
      this.setTheme(options.theme);
    } else if (this.customPalette) {
      this.setTheme(this.currentTheme);
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._syncFreeOrbitUniform();
    this._updateCompactLod(width, height);
    this.updateCameraTransform();
    this.animate();
  }

  /**
   * Builds a graded polar disc in the XZ plane concentrating radial rings inside the steep vortex cylinder.
   */
  createSubdividedDisc(radius, radialSegs, ringSegs) {
    const positions = [0, 0, 0];
    const indices = [];

    for (let i = 1; i <= ringSegs; i++) {
      const t = i / ringSegs;
      const r = radius * (0.42 * Math.pow(t, 2.15) + 0.58 * Math.pow(t, 1.35));
      for (let j = 0; j < radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;
        positions.push(Math.cos(theta) * r, 0, Math.sin(theta) * r);
      }
    }

    // Center apex fan
    for (let j = 0; j < radialSegs; j++) {
      const next = (j + 1) % radialSegs;
      indices.push(0, 1 + next, 1 + j);
    }

    // Graded concentric rings
    for (let i = 1; i < ringSegs; i++) {
      const ringA = 1 + (i - 1) * radialSegs;
      const ringB = 1 + i * radialSegs;
      for (let j = 0; j < radialSegs; j++) {
        const next = (j + 1) % radialSegs;
        const a = ringA + j;
        const b = ringA + next;
        const c = ringB + j;
        const d = ringB + next;
        indices.push(a, b, d, a, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  createBrainAssembly() {
    const group = new THREE.Group();

    const leftHemi = new THREE.Mesh(buildHemisphere(-1), this.brainMat);
    const rightHemi = new THREE.Mesh(buildHemisphere(1), this.brainMat);
    leftHemi.renderOrder = 1;
    rightHemi.renderOrder = 1;
    group.add(leftHemi, rightHemi);

    const cerebellum = new THREE.Mesh(buildCerebellum(), this.brainMat);
    cerebellum.position.set(-0.54, -0.44, 0);
    cerebellum.rotation.z = 0.08;
    cerebellum.renderOrder = 1;
    group.add(cerebellum);

    const stem = new THREE.Mesh(buildBrainstem(), this.brainMat);
    stem.position.set(-0.14, -0.69, 0);
    stem.rotation.z = 0.0;
    stem.renderOrder = 1;
    group.add(stem);

    // Center the brain's exact volumetric bounding center at (0, 0, 0) for wobble-free rotation
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    for (const child of group.children) {
      child.position.x -= center.x;
      child.position.y -= center.y;
    }

    group.rotation.x = 0.06;
    group.rotation.y = -0.38;
    return group;
  }

  _applyMaterialPalette(colors) {
    this.brainMat.uniforms.uFillColor.value.set(colors.brainFill);
    this.brainMat.uniforms.uLineColor.value.set(colors.brainLine);
    this.brainMat.uniforms.uIsLightMode.value = colors.isLight;
    this.baseShadowMat.uniforms.uInkColor.value.set(colors.ink);
    this.baseShadowMat.uniforms.uIsLightMode.value = colors.isLight;
    this.basePuntMat.uniforms.uInkColor.value.set(colors.ink);
    this.glassBackMat.uniforms.uInkColor.value.set(colors.ink);
    this.glassBackMat.uniforms.uShadowColor.value.set(colors.shadow);
    this.glassBackMat.uniforms.uIsLightMode.value = colors.isLight;
    this.glassFrontMat.uniforms.uInkColor.value.set(colors.ink);
    this.glassFrontMat.uniforms.uShadowColor.value.set(colors.shadow);
    this.glassFrontMat.uniforms.uIsLightMode.value = colors.isLight;
    this.lidMat.uniforms.uFillColor.value.set(colors.lidFill);
    this.lidMat.uniforms.uInkColor.value.set(colors.ink);
    this.lidMat.uniforms.uIsLightMode.value = colors.isLight;
    this.vortexMat.uniforms.uInkColor.value.set(colors.ink);
    this.vortexMat.uniforms.uIsLightMode.value = colors.isLight;
    this.bubblesMat.uniforms.uInkColor.value.set(colors.ink);
    this.bubblesMat.uniforms.uIsLightMode.value = colors.isLight;
  }

  setTheme(theme) {
    const resolvedTheme = theme === 'light' ? 'light' : 'dark';
    this.currentTheme = resolvedTheme;
    if (this.syncDocumentTheme && typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolvedTheme);
    }
    const baseColors =
      resolvedTheme === 'light'
        ? {
            brainFill: '#0e0e11',
            brainLine: '#ffffff',
            ink: '#0e0e10',
            shadow: '#141418',
            lidFill: '#ffffff',
            isLight: 1.0,
          }
        : {
            brainFill: '#f4f4f6',
            brainLine: '#0c0c0f',
            ink: '#ffffff',
            shadow: '#050507',
            lidFill: '#111113',
            isLight: 0.0,
          };

    const customOverride = this.customPalette
      ? this.customPalette[resolvedTheme] || this.customPalette
      : null;
    const merged = customOverride ? { ...baseColors, ...customOverride } : baseColors;
    this._applyMaterialPalette(merged);
    this.wakeRender();
  }

  /**
   * Sets or clears a custom color palette override (supports flat tokens or { light, dark } overrides).
   */
  setPalette(palette) {
    this.customPalette = palette || null;
    this.setTheme(this.currentTheme);
  }

  setPaused(paused) {
    this.isPaused = Boolean(paused);
    this.wakeRender();
  }

  /**
   * Immediately halts or resumes frame scheduling (e.g. when a sidebar panel collapses) without 4.5s coast-down.
   */
  setSuspended(suspended) {
    this.isSuspended = Boolean(suspended);
    if (this.isSuspended && this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    } else if (!this.isSuspended) {
      this.wakeRender();
    }
  }

  setSpeed(speed) {
    this.rotationSpeed = speed;
    this.wakeRender();
  }

  /**
   * Updates wheel zoom behavior (`true`, `false`, or `'modifier'`). Avoids attaching non-passive listeners when disabled.
   */
  setZoomEnabled(mode) {
    this.enableZoom = mode;
    if (!this.hostEl) return;
    const shouldListen = mode === true || mode === 'modifier';
    if (shouldListen && !this.hasWheelListener) {
      this.hostEl.addEventListener('wheel', this.handleWheel, { passive: false });
      this.hasWheelListener = true;
    } else if (!shouldListen && this.hasWheelListener) {
      this.hostEl.removeEventListener('wheel', this.handleWheel);
      this.hasWheelListener = false;
    }
  }

  setSpeedMode(mode, notify = true) {
    if (!Object.prototype.hasOwnProperty.call(SPEED_MODES, mode)) return;
    const entry = SPEED_MODES[mode];
    const nextSpeed = typeof entry === 'number' ? entry : entry.speed;
    if (typeof nextSpeed !== 'number') return;

    this.speedMode = mode;
    this.isPaused = false;
    this.rotationSpeed = nextSpeed;
    this.wakeRender();
    if (notify && typeof this.onSpeedModeChange === 'function') {
      this.onSpeedModeChange(mode);
    }
  }

  /**
   * Maps semantic K3PTA app states (`idle`, `thinking`, `syncing`, etc.) onto motion modes.
   */
  setActivityState(state, notify = true) {
    if (!state || !Object.prototype.hasOwnProperty.call(ACTIVITY_SPEED_MAP, state)) {
      return null;
    }
    this.activityState = state;
    const mappedMode = ACTIVITY_SPEED_MAP[state];
    this.setSpeedMode(mappedMode, notify);
    return mappedMode;
  }

  cycleSpeedMode(notify = true) {
    const cycleMap = {
      still: 'drehen',
      drehen: 'schnell',
      schnell: 'still',
    };
    const nextMode = cycleMap[this.speedMode] || 'drehen';
    this.setSpeedMode(nextMode, notify);
    return nextMode;
  }

  hitTestModel(clientX, clientY) {
    if (!this.hitTargets?.length || !this.raycaster) return false;
    const rect = this.hostEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.ndcPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndcPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndcPointer, this.camera);
    return this.raycaster.intersectObjects(this.hitTargets, false).length > 0;
  }

  _syncFreeOrbitUniform() {
    const val = this.freeOrbit ? 1.0 : 0.0;
    const mats = [this.basePuntMat, this.glassBackMat, this.glassFrontMat, this.lidMat, this.vortexMat];
    for (const m of mats) {
      if (m?.uniforms?.uFreeOrbit) {
        m.uniforms.uFreeOrbit.value = val;
      }
    }
  }

  setShowBaseShadow(show) {
    this.showBaseShadow = Boolean(show);
    if (this.baseShadowMesh) {
      this.baseShadowMesh.visible = this.showBaseShadow;
    }
    this.wakeRender();
  }

  setFreeOrbit(enabled) {
    const next = Boolean(enabled);
    if (next === this.freeOrbit) return;
    this.freeOrbit = next;
    this._syncFreeOrbitUniform();
    this.updateCameraTransform();
    this.wakeRender();
  }

  _computeMinFitDist() {
    if (!this.fitRadius || !this.camera) return 0;
    const tanY = Math.tan(THREE.MathUtils.degToRad((this.camera.fov || 29) * 0.5));
    const tanMin = Math.min(tanY, tanY * Math.max(this.camera.aspect || 1, 0.25));
    const fill = clampValue(this.fitFill || 0.84, 0.4, 0.96);
    const k = fill * tanMin;
    const sinMax = k / Math.sqrt(1 + k * k);
    return this.fitRadius / Math.max(sinMax, 0.05);
  }

  setViewPreset(name, notify = true) {
    const preset = VIEW_PRESETS[name] || VIEW_PRESETS.default;
    const tau = Math.PI * 2;
    let deltaYaw = (preset.yaw - this.orbitYaw) % tau;
    if (deltaYaw > Math.PI) deltaYaw -= tau;
    if (deltaYaw < -Math.PI) deltaYaw += tau;

    this.fitRadius = preset.fitRadius || 0;
    this.fitFill = preset.fitFill || 0.84;
    this.targetYaw = this.orbitYaw + deltaYaw;
    this.targetPitch = preset.pitch;
    this.targetRoll = preset.roll || 0;
    this.targetDist = preset.dist;
    this.targetLookY = preset.targetY;
    this.velYaw = 0;
    this.velPitch = 0;
    this._flickVelYaw = 0;
    this._flickVelPitch = 0;
    this.activeView = name;
    this.wakeRender();
    if (notify && typeof this.onViewChange === 'function') {
      this.onViewChange(name);
    }
  }

  nudgeYaw(deltaYaw) {
    this.targetYaw += deltaYaw;
    if (this.freeOrbit) {
      this.targetRoll = 0;
    }
    this.wakeRender();
    if (this.activeView !== null) {
      this.activeView = null;
      if (typeof this.onViewChange === 'function') {
        this.onViewChange(null);
      }
    }
  }

  nudgePitch(deltaPitch) {
    const minP = this.freeOrbit ? -1.46 : -0.58;
    const maxP = this.freeOrbit ? 1.46 : 0.96;
    this.targetPitch = clampValue(this.targetPitch + deltaPitch, minP, maxP);
    if (this.freeOrbit) {
      this.targetRoll = 0;
    }
    this.wakeRender();
    if (this.activeView !== null) {
      this.activeView = null;
      if (typeof this.onViewChange === 'function') {
        this.onViewChange(null);
      }
    }
  }

  handlePointerDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    if (!this.enableDrag && !this.enableClickCycle && !this.onModelClick) return;
    this.isDragging = true;
    this.dragMoved = false;
    this.velYaw = 0;
    this.velPitch = 0;
    this._flickVelYaw = 0;
    this._flickVelPitch = 0;
    this._lastDragTime = performance.now();

    const rect = this.hostEl.getBoundingClientRect();
    const minEdge = Math.max(Math.min(rect.width || 240, rect.height || 240, 460), 76);
    this._dragSensYaw = this.freeOrbit ? clampValue(2.15 / minEdge, 0.0085, 0.022) : 0.0085;
    this._dragSensPitch = this.freeOrbit ? clampValue(1.75 / minEdge, 0.0065, 0.0175) : 0.0065;

    this.activePointerId = e.pointerId;
    this.dragLast.x = e.clientX;
    this.dragLast.y = e.clientY;
    if (this.pointerDownPos) {
      this.pointerDownPos.x = e.clientX;
      this.pointerDownPos.y = e.clientY;
    } else {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    }
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
    if (this.enableDrag) {
      this.hostEl.classList.add('is-dragging');
      this.hostEl.style.cursor = 'grabbing';
    }
    this.wakeRender();
    try {
      this.hostEl.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore synthetic events without an active browser pointer
    }
  }

  handleDragMove(e) {
    if (!this.isDragging || !this.enableDrag) return;
    if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId) return;

    const now = performance.now();
    const dtMove = clampValue((now - this._lastDragTime) / 1000, 0.004, 0.06);
    this._lastDragTime = now;

    const dx = e.clientX - this.dragLast.x;
    const dy = e.clientY - this.dragLast.y;
    this.dragLast.x = e.clientX;
    this.dragLast.y = e.clientY;

    const totalDist = this.pointerDownPos
      ? Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y)
      : Math.hypot(dx, dy);

    if (totalDist > 5 && !this.dragMoved) {
      this.dragMoved = true;
      if (this.activeView !== null) {
        this.activeView = null;
        if (typeof this.onViewChange === 'function') {
          this.onViewChange(null);
        }
      }
    }

    if (this.dragMoved || totalDist > 2.5) {
      const dYaw = -dx * this._dragSensYaw;
      const dPitch = dy * this._dragSensPitch;
      const minP = this.freeOrbit ? -1.46 : -0.58;
      const maxP = this.freeOrbit ? 1.46 : 0.96;

      this.targetYaw += dYaw;
      this.targetPitch = clampValue(this.targetPitch + dPitch, minP, maxP);

      if (this.freeOrbit) {
        if (totalDist > 12 && Math.abs(this.targetRoll) > 0.0001) {
          this.targetRoll *= Math.exp(-Math.hypot(dx, dy) * 0.022);
          if (Math.abs(this.targetRoll) < 0.004) {
            this.targetRoll = 0;
          }
        }
        const instY = clampValue(dYaw / dtMove, -6.0, 6.0);
        const instP = clampValue(dPitch / dtMove, -4.5, 4.5);
        this._flickVelYaw = this._flickVelYaw * 0.55 + instY * 0.45;
        this._flickVelPitch = this._flickVelPitch * 0.55 + instP * 0.45;
      }
      this.wakeRender();
    }
  }

  handlePointerMove(e) {
    if (this.isDragging) return;
    if (this.enableHoverTilt) {
      const rect = this.hostEl.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = clampValue(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
        const ny = clampValue(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
        this.pointerTarget.x = nx * 0.042;
        this.pointerTarget.y = ny * 0.024;
        this.wakeRender();
      }
    }
    const overModel = (this.enableClickCycle || this.onModelClick) ? this.hitTestModel(e.clientX, e.clientY) : false;
    this.hostEl.classList.toggle('is-over-model', overModel);
    if (this.enableDrag) {
      this.hostEl.style.cursor = overModel ? 'pointer' : 'grab';
    }
  }

  handlePointerUp(e) {
    if (!this.isDragging) return;
    if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId) return;
    const wasMoved = this.dragMoved;
    this.isDragging = false;
    this.hostEl.classList.remove('is-dragging');
    if (this.enableDrag) {
      this.hostEl.style.cursor = 'grab';
    }
    try {
      if (this.activePointerId !== null) {
        this.hostEl.releasePointerCapture?.(this.activePointerId);
      }
    } catch {
      // Ignore synthetic release errors
    }
    this.activePointerId = null;

    if (wasMoved && this.freeOrbit && performance.now() - this._lastDragTime < 45) {
      const speedMag = Math.hypot(this._flickVelYaw, this._flickVelPitch);
      if (speedMag > 0.45) {
        this.velYaw = clampValue(this._flickVelYaw, -4.5, 4.5);
        this.velPitch = clampValue(this._flickVelPitch, -3.2, 3.2);
        this.wakeRender();
      }
    }

    if (!wasMoved && (!e.detail || e.detail <= 1) && this.hitTestModel(e.clientX, e.clientY)) {
      let allowCycle = this.enableClickCycle;
      if (this.onModelClick) {
        const clickResult = this.onModelClick(e, this);
        if (clickResult === false) {
          allowCycle = false;
        }
      }
      if (allowCycle) {
        const now = performance.now();
        if (now - this.lastModelClickTime > 420) {
          this.modeBeforeLastClick = this.speedMode;
          this.lastModelClickTime = now;
        }
        this.cycleSpeedMode(true);
      }
    }
  }

  handlePointerLeave() {
    if (this.pointerTarget.x !== 0 || this.pointerTarget.y !== 0) {
      this.pointerTarget.x = 0;
      this.pointerTarget.y = 0;
      this.wakeRender();
    }
    this.hostEl.classList.remove('is-over-model');
    if (!this.isDragging && this.enableDrag) {
      this.hostEl.style.cursor = 'grab';
    }
  }

  handleWheel(e) {
    if (!this.enableZoom) return;
    if (this.enableZoom === 'modifier' && !(e.ctrlKey || e.metaKey || e.altKey)) return;
    e.preventDefault();
    const minD = Math.max(4.6, this._computeMinFitDist());
    this.targetDist = clampValue(this.targetDist + e.deltaY * 0.0032, minD, 11.0);
    this.wakeRender();
  }

  handleDoubleClick() {
    if (!this.enableDrag && !this.enableClickCycle) return;
    if (this.enableClickCycle && this.modeBeforeLastClick && performance.now() - this.lastModelClickTime < 520) {
      this.setSpeedMode(this.modeBeforeLastClick, true);
      this.modeBeforeLastClick = null;
    }
    if (this.enableDrag) {
      this.setViewPreset(this.defaultView, true);
    }
  }

  updateCameraTransform() {
    const effDist = this.fitRadius > 0 ? Math.max(this.orbitDist, this._computeMinFitDist()) : this.orbitDist;
    const effYaw = this.orbitYaw - this.pointerCurrent.x;
    const minP = this.freeOrbit ? -1.48 : -0.62;
    const maxP = this.freeOrbit ? 1.48 : 0.98;
    const effPitch = clampValue(this.orbitPitch + this.pointerCurrent.y, minP, maxP);
    const effRoll = this.freeOrbit ? this.orbitRoll : 0;

    if (this.freeOrbit || Math.abs(effRoll) > 0.0001) {
      this._tmpEuler.set(-effPitch, effYaw, effRoll, 'YXZ');
      this._effQuat.setFromEuler(this._tmpEuler);
      this._offsetVec.set(0, 0, effDist).applyQuaternion(this._effQuat);
      this._upVec.set(0, 1, 0).applyQuaternion(this._effQuat);
      this.camera.position.set(this._offsetVec.x, this.targetY + this._offsetVec.y, this._offsetVec.z);
      this.camera.up.copy(this._upVec);
      this.camera.lookAt(0, this.targetY, 0);
    } else {
      const cosP = Math.cos(effPitch);
      this.camera.position.set(
        effDist * cosP * Math.sin(effYaw),
        this.targetY + effDist * Math.sin(effPitch),
        effDist * cosP * Math.cos(effYaw)
      );
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, this.targetY, 0);
    }

    // Preserve studio key-light placement while geometry physically orbits 360°
    this.baseShadowMat.uniforms.uOrbitYaw.value = effYaw;
    this.basePuntMat.uniforms.uOrbitYaw.value = effYaw;
    this.glassBackMat.uniforms.uOrbitYaw.value = effYaw;
    this.glassFrontMat.uniforms.uOrbitYaw.value = effYaw;
    this.lidMat.uniforms.uOrbitYaw.value = effYaw;
    this.vortexMat.uniforms.uOrbitYaw.value = effYaw;
  }

  _updateCompactLod(widthPx, heightPx) {
    const w = widthPx || 460;
    const h = heightPx || w * (540 / 460);
    const minDim = Math.min(w, h);
    const t = clampValue((180 - minDim) / (180 - 56), 0, 1);
    const compact = t * t * (3 - 2 * t);
    this.compactScale = compact;
    const mats = [
      this.brainMat,
      this.glassBackMat,
      this.glassFrontMat,
      this.lidMat,
      this.baseShadowMat,
      this.vortexMat,
      this.bubblesMat,
    ];
    for (const m of mats) {
      if (m?.uniforms?.uCompact) {
        m.uniforms.uCompact.value = compact;
      }
    }
  }

  handleResize() {
    if (this.isDisposed || this.isContextLost || !this.hostEl) return;
    const width = this.hostEl.clientWidth;
    const height = this.hostEl.clientHeight;
    if (!width || !height) return;
    const pr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this._updateCompactLod(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height);
    this.wakeRender();
  }

  handleVisibilityChange() {
    this.isDocVisible = typeof document === 'undefined' ? true : !document.hidden;
    if (this.isDocVisible) {
      this.wakeRender();
    }
  }

  handleContextLost(e) {
    e.preventDefault();
    this.isContextLost = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.onContextLost?.(this);
  }

  handleContextRestored() {
    this.isContextLost = false;
    this.handleResize();
    this.updateCameraTransform();
    this.onContextRestored?.(this);
    this.wakeRender();
  }

  wakeRender() {
    if (this.isDisposed || this.isContextLost || this.isSuspended) return;
    this.needsRender = true;
    if (this.pauseWhenHidden && (!this.isDocVisible || !this.isInViewport)) return;
    if (this.rafId === null) {
      this.clock.getDelta();
      this.rafId = requestAnimationFrame(this.animate);
    }
  }

  animate() {
    this.rafId = null;
    if (this.isDisposed || this.isContextLost || this.isSuspended) {
      return;
    }
    if (this.pauseWhenHidden && (!this.isDocVisible || !this.isInViewport)) {
      return;
    }

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // Frame-rate independent asymmetric fluid inertia (slow viscous coast-down to standstill)
    const targetSpeed = this.isPaused ? 0.0 : this.rotationSpeed;
    const isStopping = targetSpeed <= 0.001;
    const rate = targetSpeed < this.currentSpeed ? (isStopping ? 0.68 : 1.15) : 1.85;
    const dragLerp = 1.0 - Math.exp(-dt * rate);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * dragLerp;
    if (isStopping && this.currentSpeed > 0.0) {
      // Viscous wall friction resolves the tail to true zero standstill without infinite drift
      this.currentSpeed = Math.max(0.0, this.currentSpeed - dt * 0.022);
    }
    if (isStopping && this.currentSpeed < 0.002) {
      this.currentSpeed = 0.0;
    }

    if (this.currentSpeed > 0.0005) {
      const step = dt * this.currentSpeed;
      // Serene bubble flow cap keeps rising air bubbles graceful and unhurried even at high Tempo
      const flowStep = dt * Math.min(0.29 * Math.pow(this.currentSpeed, 0.46), 0.42);
      this.swirlTime += step;
      this.bubbleTime += flowStep;

      // Smooth centered 360-degree rotation + subtle 3-axis fluid buoyancy precession
      this.brainGroup.rotation.y += step * 0.65;
      this.brainGroup.rotation.x = 0.05 + Math.sin(this.swirlTime * 0.78) * 0.030;
      this.brainGroup.rotation.z = Math.sin(this.swirlTime * 0.56 + 1.1) * 0.022;
      this.brainGroup.position.y =
        -0.415 + Math.sin(this.swirlTime * 1.15) * 0.019 + Math.cos(this.swirlTime * 0.48) * 0.007;

      // Sync surface water vortex & rising flow-driven bubbles smoothly
      this.vortexMat.uniforms.uTime.value = this.swirlTime;
      this.bubblesMat.uniforms.uTime.value = this.bubbleTime;
    }
    this.vortexMat.uniforms.uSpeed.value = this.currentSpeed;
    this.bubblesMat.uniforms.uSpeed.value = this.currentSpeed;

    // Integrate smooth inertial coasting momentum on brisk free-orbit release
    if (!this.isDragging && (Math.abs(this.velYaw) > 0.005 || Math.abs(this.velPitch) > 0.005)) {
      this.targetYaw += this.velYaw * dt;
      const minP = this.freeOrbit ? -1.46 : -0.58;
      const maxP = this.freeOrbit ? 1.46 : 0.96;
      this.targetPitch = clampValue(this.targetPitch + this.velPitch * dt, minP, maxP);
      if (this.targetPitch === minP || this.targetPitch === maxP) {
        this.velPitch = 0;
      }
      const decay = Math.exp(-dt * 8.5);
      this.velYaw *= decay;
      this.velPitch *= decay;
      if (Math.abs(this.velYaw) < 0.005) this.velYaw = 0;
      if (Math.abs(this.velPitch) < 0.005) this.velPitch = 0;
    }

    // Responsive 1:1 follow while dragging + silky orbital glide on release
    const camLerp = 1.0 - Math.exp(-dt * (this.isDragging ? 24.0 : 9.5));
    this.orbitYaw += (this.targetYaw - this.orbitYaw) * camLerp;
    this.orbitPitch += (this.targetPitch - this.orbitPitch) * camLerp;
    this.orbitRoll += (this.targetRoll - this.orbitRoll) * camLerp;
    this.orbitDist += (this.targetDist - this.orbitDist) * camLerp;
    this.targetY += (this.targetLookY - this.targetY) * camLerp;

    const tiltLerp = 1.0 - Math.exp(-dt * 6.5);
    this.pointerCurrent.x += (this.pointerTarget.x - this.pointerCurrent.x) * tiltLerp;
    this.pointerCurrent.y += (this.pointerTarget.y - this.pointerCurrent.y) * tiltLerp;

    const velSettled = Math.abs(this.velYaw) < 0.005 && Math.abs(this.velPitch) < 0.005;
    const camSettled =
      velSettled &&
      Math.abs(this.targetYaw - this.orbitYaw) < 0.0006 &&
      Math.abs(this.targetPitch - this.orbitPitch) < 0.0006 &&
      Math.abs(this.targetRoll - this.orbitRoll) < 0.0006 &&
      Math.abs(this.targetDist - this.orbitDist) < 0.0012 &&
      Math.abs(this.targetLookY - this.targetY) < 0.0006;
    const hoverSettled =
      Math.abs(this.pointerTarget.x - this.pointerCurrent.x) < 0.0003 &&
      Math.abs(this.pointerTarget.y - this.pointerCurrent.y) < 0.0003;

    if (camSettled) {
      this.orbitYaw = this.targetYaw;
      this.orbitPitch = this.targetPitch;
      this.orbitRoll = this.targetRoll;
      this.orbitDist = this.targetDist;
      this.targetY = this.targetLookY;
    }
    if (hoverSettled) {
      this.pointerCurrent.x = this.pointerTarget.x;
      this.pointerCurrent.y = this.pointerTarget.y;
    }

    this.updateCameraTransform();
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;

    const wantsContinuous =
      !this.idleSleep ||
      (!this.isPaused && this.rotationSpeed > 0.0005) ||
      this.currentSpeed > 0.0005 ||
      this.isDragging ||
      !camSettled ||
      !hoverSettled;

    if (wantsContinuous) {
      this.rafId = requestAnimationFrame(this.animate);
    } else {
      this.rafId = null;
    }
  }

  /**
   * Releases animation frames, DOM/Resize listeners, GPU geometries/materials, and WebGL context cleanly.
   */
  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      window.removeEventListener('pointermove', this.handleDragMove);
      window.removeEventListener('pointerup', this.handlePointerUp);
    }
    if (this.hostEl) {
      this.hostEl.removeEventListener('pointerdown', this.handlePointerDown);
      this.hostEl.removeEventListener('pointermove', this.handlePointerMove);
      this.hostEl.removeEventListener('pointerup', this.handlePointerUp);
      this.hostEl.removeEventListener('pointercancel', this.handlePointerUp);
      this.hostEl.removeEventListener('pointerleave', this.handlePointerLeave);
      this.hostEl.removeEventListener('wheel', this.handleWheel);
      this.hostEl.removeEventListener('dblclick', this.handleDoubleClick);
      this.hostEl.classList.remove('is-dragging', 'is-over-model');
      this.hasWheelListener = false;
    }
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost, false);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
    }

    const disposedGeos = new Set();
    const disposedMats = new Set();
    this.scene.traverse((obj) => {
      if (obj.geometry && !disposedGeos.has(obj.geometry)) {
        disposedGeos.add(obj.geometry);
        obj.geometry.dispose();
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat && !disposedMats.has(mat)) {
            disposedMats.add(mat);
            mat.dispose();
          }
        }
      }
    });

    this.renderer.dispose();
    if (this.forceContextLossOnDispose) {
      this.renderer.forceContextLoss();
    }
    if (this.renderer.domElement && this.renderer.domElement.parentNode === this.hostEl) {
      this.hostEl.removeChild(this.renderer.domElement);
    }
  }

  destroy() {
    this.dispose();
  }
}

/**
 * Mounts standalone demo controls when loaded inside the standalone index.html shell.
 */
export function mountStandaloneDemo() {
  const hostEl = typeof document !== 'undefined' ? document.getElementById('brain-canvas-host') : null;
  if (!hostEl) return null;

  const widget = new BrainJarWidget(hostEl);

  const btnDark = document.getElementById('btn-dark');
  const btnLight = document.getElementById('btn-light');
  const speedModeButtons = Array.from(document.querySelectorAll('.speed-mode-btn'));
  const viewButtons = Array.from(document.querySelectorAll('.view-btn'));

  function syncSpeedModeUI(activeMode) {
    for (const btn of speedModeButtons) {
      const isActive = btn.dataset.speedMode === activeMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  function syncViewUI(activeName) {
    for (const btn of viewButtons) {
      const isActive = activeName !== null && btn.dataset.view === activeName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  widget.onSpeedModeChange = syncSpeedModeUI;
  widget.onViewChange = syncViewUI;
  syncSpeedModeUI(widget.speedMode);

  btnDark?.addEventListener('click', () => {
    widget.setTheme('dark');
    btnDark.classList.add('active');
    btnLight?.classList.remove('active');
  });

  btnLight?.addEventListener('click', () => {
    widget.setTheme('light');
    btnLight.classList.add('active');
    btnDark?.classList.remove('active');
  });

  for (const btn of speedModeButtons) {
    btn.addEventListener('click', () => {
      widget.setSpeedMode(btn.dataset.speedMode, true);
    });
  }

  for (const btn of viewButtons) {
    btn.addEventListener('click', () => {
      widget.setViewPreset(btn.dataset.view, true);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (e.code === 'Space') {
      if (tag === 'BUTTON') return;
      e.preventDefault();
      widget.cycleSpeedMode(true);
    } else if (e.key === '1') {
      widget.setViewPreset('default', true);
    } else if (e.key === '2') {
      widget.setViewPreset('vortex', true);
    } else if (e.key === '3') {
      widget.setViewPreset('profile', true);
    } else if (e.key === '4') {
      widget.setViewPreset('base', true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      widget.nudgeYaw(0.24);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      widget.nudgeYaw(-0.24);
    }
  });

  return widget;
}

if (typeof document !== 'undefined' && document.getElementById('brain-canvas-host')) {
  mountStandaloneDemo();
}
