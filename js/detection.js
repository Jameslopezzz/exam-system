/* =========================================================
   Cheat-detection module (face-api.js)
   ---------------------------------------------------------
   Detects, in the browser (no video ever leaves the device):
     - no face visible
     - multiple faces
     - face angle (head turned left/right or up/down)
     - eye gaze (looking away from the screen)

   Method
   - TinyFaceDetector finds faces; the 68-point landmark model gives
     jaw, nose, and eye contours.
   - HEAD POSE: nose position relative to jaw width (yaw) and relative
     to the eye-line/chin span (pitch), compared with a baseline that
     is calibrated while the student looks at the screen.
   - GAZE: for each eye, the darkest pixels inside the eye contour are
     located (iris/pupil); their horizontal / vertical position inside
     the eye is compared with the calibrated baseline.
   - A condition must persist for HOLD_MS before it counts, and the same
     violation type has a COOLDOWN_MS so one glance does not burn
     every strike.
   Tune the constants below during your alpha test.
   ========================================================= */

var ProctorDetect = (function () {
  var CFG = {
    MODEL_URL: "models",            // local folder (works offline on XAMPP)
    INTERVAL_MS: 400,               // analysis rate
    CALIBRATION_FRAMES: 12,         // frames used to learn "looking at screen"
    YAW_LIMIT: 0.16,                // head-turn tolerance (fraction of face width)
    PITCH_LIMIT: 0.2,               // head up/down tolerance
    GAZE_X_LIMIT: 0.2,              // iris horizontal shift inside the eye
    GAZE_Y_LIMIT: 0.28,             // iris vertical shift (looking down at notes)
    HOLD_MS: 2500,                  // how long a condition must persist
    NO_FACE_HOLD_MS: 4000,
    COOLDOWN_MS: 10000              // min gap between same-type violations
  };

  var state = {
    running: false, ready: false, video: null, timer: null, canvas: null, ctx: null,
    onViolation: null, onStatus: null, rules: {},
    calib: [], baseline: null, since: {}, lastFired: {}, busy: false
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function mean(arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / (arr.length || 1); }
  function pt(p) { return { x: p.x, y: p.y }; }

  /* Head pose from landmarks -> {yaw, pitch}; ~0.5 / ~0.5 when facing the screen. */
  function headPose(lm) {
    var j = lm.getJawOutline(), nose = lm.getNose(), le = lm.getLeftEye(), re = lm.getRightEye();
    var left = pt(j[0]), right = pt(j[16]), chin = pt(j[8]), tip = pt(nose[3]);
    var width = Math.max(1, right.x - left.x);
    var eyeY = (mean(le.map(function (p) { return p.y; })) + mean(re.map(function (p) { return p.y; }))) / 2;
    var span = Math.max(1, chin.y - eyeY);
    return { yaw: (tip.x - left.x) / width, pitch: (tip.y - eyeY) / span };
  }

  /* Locate the iris (darkest area) inside one eye contour -> {x, y} in 0..1 of the eye box. */
  function irisPosition(points) {
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var w = x1 - x0, h = y1 - y0;
    if (w < 6 || h < 3) return null;
    var c = state.canvas, ctx = state.ctx;
    c.width = w; c.height = h;
    ctx.drawImage(state.video, x0, y0, w, h, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h).data, lum = [], i;
    for (i = 0; i < data.length; i += 4) lum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    var sorted = lum.slice().sort(function (a, b) { return a - b; });
    var cut = sorted[Math.max(0, Math.floor(sorted.length * 0.18))];
    var sx = 0, sy = 0, n = 0;
    for (i = 0; i < lum.length; i++) {
      if (lum[i] <= cut) { sx += (i % w); sy += Math.floor(i / w); n++; }
    }
    if (!n) return null;
    return { x: sx / n / w, y: sy / n / h };
  }

  function gazePosition(lm) {
    var a = irisPosition(lm.getLeftEye()), b = irisPosition(lm.getRightEye());
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* Raise a violation if `active` has been true for `holdMs`, respecting cooldown. */
  function sustain(typeId, label, active, holdMs) {
    var now = Date.now();
    if (!active) { state.since[typeId] = null; return; }
    if (!state.since[typeId]) state.since[typeId] = now;
    if (now - state.since[typeId] >= holdMs && now - (state.lastFired[typeId] || 0) >= CFG.COOLDOWN_MS) {
      state.lastFired[typeId] = now;
      state.since[typeId] = null;
      if (state.onViolation) state.onViolation(typeId, label);
    }
  }

  function status(angle, gaze, faces, model) {
    if (state.onStatus) state.onStatus({ angle: angle, gaze: gaze, faces: faces, model: model });
  }

  function analyse() {
    if (!state.running || state.busy || state.video.readyState < 2) return;
    state.busy = true;
    var opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    faceapi.detectAllFaces(state.video, opts).withFaceLandmarks().then(function (faces) {
      state.busy = false;
      var r = state.rules, n = faces.length;

      if (n === 0) {
        status("Not visible", "—", 0, "Running");
        if (r.faceAngle !== false || r.multiFace !== false) sustain("no-face", "No face detected in camera", true, CFG.NO_FACE_HOLD_MS);
        sustain("multiple-faces", "", false, 0);
        return;
      }
      sustain("no-face", "", false, 0);

      if (n > 1) {
        status("—", "—", n, "Running");
        if (r.multiFace !== false) sustain("multiple-faces", "Another person detected on camera", true, 2000);
        return;
      }
      sustain("multiple-faces", "", false, 0);

      var lm = faces[0].landmarks, pose = headPose(lm), gz = gazePosition(lm);

      /* calibration: learn the student's "looking at the screen" pose */
      if (!state.baseline) {
        state.calib.push({ yaw: pose.yaw, pitch: pose.pitch, gx: gz ? gz.x : null, gy: gz ? gz.y : null });
        status("Calibrating…", "Calibrating…", 1, "Calibrating " + state.calib.length + "/" + CFG.CALIBRATION_FRAMES);
        if (state.calib.length >= CFG.CALIBRATION_FRAMES) {
          var gxs = state.calib.filter(function (c) { return c.gx !== null; });
          state.baseline = {
            yaw: mean(state.calib.map(function (c) { return c.yaw; })),
            pitch: mean(state.calib.map(function (c) { return c.pitch; })),
            gx: gxs.length ? mean(gxs.map(function (c) { return c.gx; })) : null,
            gy: gxs.length ? mean(gxs.map(function (c) { return c.gy; })) : null
          };
        }
        return;
      }

      var b = state.baseline;
      var dYaw = pose.yaw - b.yaw, dPitch = pose.pitch - b.pitch;
      var turned = Math.abs(dYaw) > CFG.YAW_LIMIT || Math.abs(dPitch) > CFG.PITCH_LIMIT;
      var angleText = turned ? (Math.abs(dYaw) > CFG.YAW_LIMIT ? (dYaw > 0 ? "Turned left" : "Turned right") : (dPitch > 0 ? "Tilted up" : "Tilted down")) : "Centered";

      var looking = false, gazeText = "On screen";
      if (!turned && gz && b.gx !== null) {
        var dx = gz.x - b.gx, dy = gz.y - b.gy;
        if (Math.abs(dx) > CFG.GAZE_X_LIMIT) { looking = true; gazeText = dx > 0 ? "Looking left" : "Looking right"; }
        else if (dy > CFG.GAZE_Y_LIMIT) { looking = true; gazeText = "Looking down"; }
      } else if (turned) { gazeText = "—"; }

      status(angleText, gazeText, 1, "Running");
      if (r.faceAngle !== false) sustain("face-angle", "Face angle away from screen", turned, CFG.HOLD_MS);
      if (r.eyeGaze !== false) sustain("eye-gaze", "Eye gaze off-screen", looking, CFG.HOLD_MS);
    }).catch(function () { state.busy = false; });
  }

  return {
    /* opts: { rules, onViolation(typeId,label), onStatus(obj) } -> Promise */
    start: function (video, opts) {
      state.video = video; state.rules = opts.rules || {};
      state.onViolation = opts.onViolation; state.onStatus = opts.onStatus;
      state.canvas = document.createElement("canvas");
      state.ctx = state.canvas.getContext("2d", { willReadFrequently: true });
      status("—", "—", "—", "Loading model…");
      return (window.faceapi ? Promise.resolve() : loadScript("js/vendor/face-api.js"))
        .then(function () {
          return Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CFG.MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(CFG.MODEL_URL)
          ]);
        })
        .then(function () {
          state.ready = true; state.running = true;
          status("Calibrating…", "Calibrating…", "—", "Calibrating");
          state.timer = window.setInterval(analyse, CFG.INTERVAL_MS);
        })
        .catch(function (err) {
          status("—", "—", "—", "Model failed to load");
          throw err;
        });
    },
    stop: function () { state.running = false; if (state.timer) window.clearInterval(state.timer); },
    recalibrate: function () { state.baseline = null; state.calib = []; },
    config: CFG
  };
})();
