/* =========================================================
   Exam runner: navigation, timer, text-to-speech,
   webcam preview and anti-cheat detection
   ========================================================= */

(function () {
  var params = new URLSearchParams(window.location.search);
  var examId = params.get("exam");
  var exam = null;            // loaded from api/exam.php?action=start
  var retryQueue = [];        // violations that could not reach the server yet
  var camReady = false;
  var tabFlagAt = 0;

  var index = 0;
  var answers = {};
  var picked = {};   // question id -> index of the letter the student clicked (choices can share the same text)
  var violations = [];
  var submitted = null; // null | "manual" | "auto"
  var DEMO = params.get("demo") === "1";
  var secondsLeft = 0;
  var timerId = null;
  var hbId = null;
  var toastTimer = null;
  var speaking = false;
  var speechRate = 1;
  var camStream = null;

  var ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  /* ---------- helpers ---------- */

  function answeredCount() {
    var n = 0;
    for (var key in answers) {
      if (answers[key] && String(answers[key]).trim()) n++;
    }
    return n;
  }

  function timeLabel() {
    var m = Math.floor(secondsLeft / 60);
    var s = secondsLeft % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function notify(message) {
    var wrap = el("toastWrap");
    if (!wrap) return;
    wrap.innerHTML = '<div class="toast">' + esc(message) + "</div>";
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      wrap.innerHTML = "";
    }, 4000);
  }

  /* ---------- text to speech ---------- */

  function stopSpeech() {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    speaking = false;
    var btn = el("ttsBtn");
    if (btn) btn.textContent = "Read aloud";
  }

  function readAloud() {
    if (!ttsSupported || !exam) return;
    if (speaking) {
      stopSpeech();
      return;
    }
    var q = exam.questions[index];
    if (!q) return;

    var extra = "";
    if (q.type === "multiple-choice" && q.choices) {
      extra =
        " Choices: " +
        q.choices
          .map(function (c, i) {
            return String.fromCharCode(65 + i) + ". " + c;
          })
          .join(". ");
    }

    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance("Question " + (index + 1) + ". " + q.prompt + extra);
    utter.rate = speechRate;
    utter.lang = "en-US";
    utter.onend = stopSpeech;
    utter.onerror = stopSpeech;
    speaking = true;
    var btn = el("ttsBtn");
    if (btn) btn.textContent = "Stop reading";
    window.speechSynthesis.speak(utter);
  }

  /* ---------- violations ---------- */

  function ruleOn(key) {
    return !exam.rules || exam.rules[key] !== false;
  }

  function nowLabel() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function sendViolation(v) {
    return API.post("violation.php", {
      exam_id: exam.id, type_id: v.typeId, label: v.label, answers: answers
    }).then(function (r) {
      if (r.auto_submitted) finishExam("auto", "violations", r.result);
      else notify("Violation " + r.count + " of " + r.threshold + ": " + v.label);
    }).catch(function (e) {
      if (e.status === 409) finishExam("auto", "violations", { forced: true });
      else retryQueue.push(v);                    // offline: retried by the heartbeat
    });
  }

  function recordViolation(typeId, label) {
    if (submitted || !exam) return;
    if (violations.length >= exam.threshold) return;
    var v = { typeId: typeId, label: label, time: nowLabel() };
    violations.push(v);
    renderProctor();
    if (violations.length >= exam.threshold) notify("Maximum violations reached. Submitting your exam…");
    sendViolation(v);
    // If the server cannot be reached, still lock the exam locally at the limit.
    if (violations.length >= exam.threshold) {
      window.setTimeout(function () {
        if (!submitted) finishExam("auto", "violations");
      }, 3000);
    }
  }

  function bindAntiCheat() {
    function block(e, label) {
      if (!ruleOn("copyPaste")) return;
      e.preventDefault();
      recordViolation("copy-paste", label);
    }

    document.addEventListener("copy", function (e) { block(e, "Copy attempt blocked"); });
    document.addEventListener("paste", function (e) { block(e, "Paste attempt blocked"); });
    document.addEventListener("cut", function (e) { block(e, "Cut attempt blocked"); });
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("keydown", function (e) {
      var key = (e.key || "").toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (["c", "v", "x"].indexOf(key) !== -1 && ruleOn("copyPaste")) {
          e.preventDefault();
          recordViolation("copy-paste", "Keyboard shortcut blocked");
        } else if (["p", "s", "u"].indexOf(key) !== -1) {
          e.preventDefault();                      // blocked, but not a violation
          notify("That shortcut is disabled during the exam.");
        }
      }
      if (key === "printscreen") {
        e.preventDefault();
        notify("Screen capture is not allowed.");
      }
    });

    function leftWindow() {
      if (!ruleOn("tabSwitch") || !camReady) return;
      var t = Date.now();
      if (t - tabFlagAt < 2000) return;            // tab switch + blur fire together; count once
      tabFlagAt = t;
      recordViolation("tab-switch", "Left the exam window");
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") leftWindow();
    });
    window.addEventListener("blur", leftWindow);   // alt-tab to another app while tab stays visible
  }

  /* ---------- webcam + detection ---------- */

  function setCamState(state) {
    var dot = el("camDot");
    var text = el("camText");
    var denied = el("camDenied");
    if (dot) dot.className = "cam-state__dot" + (state === "on" ? " is-live" : "");
    if (text) text.textContent = state === "on" ? "Recording" : state === "denied" ? "No camera" : "Starting";
    if (denied) denied.hidden = state !== "denied";
  }

  function lockForCamera() {
    if (el("camLock")) return;
    var d = document.createElement("div");
    d.id = "camLock";
    d.setAttribute("style", "position:fixed;inset:0;z-index:999;background:rgba(20,20,20,.92);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem");
    d.innerHTML = '<div style="max-width:30rem"><h2>Camera required</h2>' +
      "<p>This examination is proctored. Allow camera access in your browser, then press Retry. The exam timer keeps running.</p>" +
      '<button type="button" class="btn btn--gold" id="camRetry">Retry camera</button></div>';
    document.body.appendChild(d);
    el("camRetry").addEventListener("click", function () { d.remove(); startCamera(); });
  }

  function updateReadouts(st) {
    var map = { rdAngle: st.angle, rdGaze: st.gaze, rdFaces: st.faces, rdModel: st.model };
    for (var id in map) { var n = el(id); if (n) n.textContent = map[id]; }
  }

  function startDetection(video) {
    if (typeof ProctorDetect === "undefined") return;
    ProctorDetect.start(video, {
      rules: exam.rules,
      onViolation: recordViolation,
      onStatus: updateReadouts
    }).catch(function () {
      notify("Face-detection model could not be loaded. Tell your proctor.");
    });
  }

  function startCamera() {
    var video = el("camVideo");
    if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamState("denied");
      if (exam.rules.requireCamera) lockForCamera();
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then(function (stream) {
        camStream = stream;
        video.srcObject = stream;
        setCamState("on");
        video.onplaying = function () {
          window.setTimeout(function () { camReady = true; }, 3000);   // grace period after permission prompt
        };
        if (ruleOn("faceAngle") || ruleOn("eyeGaze") || ruleOn("multiFace")) startDetection(video);
      })
      .catch(function () {
        setCamState("denied");
        if (exam.rules.requireCamera) lockForCamera();
      });
  }

  function stopCamera() {
    if (typeof ProctorDetect !== "undefined") ProctorDetect.stop();
    if (!camStream) return;
    camStream.getTracks().forEach(function (t) { t.stop(); });
    camStream = null;
  }

  /* ---------- network status + heartbeat ---------- */

  function setNet(ms) {
    var dot = el("netDot"), text = el("netText");
    if (!dot || !text) return;
    if (ms === null) { dot.style.background = "#c62828"; text.textContent = "Offline"; return; }
    dot.style.background = ms < 150 ? "#2e7d32" : ms < 400 ? "#f9a825" : "#ef6c00";
    text.textContent = (ms < 150 ? "Good" : ms < 400 ? "Fair" : "Slow") + " · " + ms + " ms";
  }

  function heartbeat() {
    if (submitted || !exam) return;
    var t0 = performance.now();
    API.get("ping.php").then(function () {
      var ms = Math.round(performance.now() - t0);
      setNet(ms);
      return API.post("ping.php", {
        exam_id: exam.id, ms: ms,
        progress: Math.min(99, Math.round((answeredCount() / exam.questions.length) * 100)),
        answers: answers
      });
    }).then(function (r) {
      if (!r) return;
      if (r.forced) { finishExam("auto", "instructor", { forced: true }); return; }
      if (r.warning) notify("Instructor warning: " + r.warning);
      var queued = retryQueue.splice(0);           // flush violations that failed earlier
      queued.forEach(sendViolation);
    }).catch(function () { setNet(null); });
  }

  /* ---------- rendering ---------- */

  function renderNavigator() {
    var nav = el("navigator");
    if (!nav) return;

    var buttons = exam.questions
      .map(function (q, i) {
        var cls = "nav-btn";
        if (i === index) cls += " is-current";
        else if (answers[q.id] && String(answers[q.id]).trim()) cls += " is-answered";
        return '<button type="button" class="' + cls + '" data-goto="' + i + '">' + (i + 1) + "</button>";
      })
      .join("");

    nav.innerHTML =
      buttons +
      '<span class="navigator__count">' + answeredCount() + " of " + exam.questions.length + " answered</span>";

    var btns = nav.querySelectorAll("[data-goto]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          index = Number(btn.getAttribute("data-goto"));
          stopSpeech();
          render();
        });
      })(btns[i]);
    }
  }

  function renderQuestion() {
    var host = el("questionHost");
    var q = exam.questions[index];
    if (!host || !q) return;

    var body;
    if (q.type === "multiple-choice") {
      // Which letter is selected: the one clicked, or (after a reload) the first choice matching the saved answer.
      var chosenIdx = picked[q.id];
      if (chosenIdx === undefined || (q.choices || [])[chosenIdx] !== answers[q.id]) chosenIdx = (q.choices || []).indexOf(answers[q.id]);
      body =
        '<ul class="choices">' +
        (q.choices || [])
          .map(function (choice, i) {
            var selected = i === chosenIdx;
            return (
              "<li><label class=\"choice" + (selected ? " is-selected" : "") + "\">" +
              '<input type="radio" name="' + esc(q.id) + '" value="' + esc(choice) + '"' +
              (selected ? " checked" : "") + " />" +
              '<span class="choice__letter">' + String.fromCharCode(65 + i) + ".</span>" +
              "<span>" + esc(choice) + "</span></label></li>"
            );
          })
          .join("") +
        "</ul>";
    } else {
      var text = answers[q.id] || "";
      body =
        '<div class="essay"><textarea id="essayInput" rows="8" placeholder="Type your answer here. Pasting is disabled.">' +
        esc(text) + "</textarea>" +
        '<p class="essay__count" id="wordCount">' + wordCount(text) + " words</p></div>";
    }

    var last = index === exam.questions.length - 1;

    host.innerHTML =
      '<article class="question-card">' +
      '<div class="question-card__top"><div>' +
      '<p class="question-card__meta">Question ' + (index + 1) + " of " + exam.questions.length +
      " · " + q.points + " points</p>" +
      '<h1 class="question-card__prompt">' + esc(q.prompt) + "</h1></div>" +
      '<div class="tts">' +
      '<button type="button" class="tts__btn" id="ttsBtn"' + (ttsSupported ? "" : " disabled") + ">Read aloud</button>" +
      '<select class="tts__rate" id="ttsRate" aria-label="Reading speed">' +
      '<option value="0.75">0.75x</option><option value="1" selected>1x</option>' +
      '<option value="1.25">1.25x</option><option value="1.5">1.5x</option></select>' +
      "</div></div>" +
      renderMedia(q.media) +
      body +
      '<div class="question-card__foot">' +
      '<button type="button" class="btn btn--outline" id="prevBtn"' + (index === 0 ? " disabled" : "") + ">Previous</button>" +
      '<button type="button" class="btn btn--primary" id="nextBtn">' +
      (last ? "Finish and submit" : "Next question") + "</button></div></article>";

    var rateSelect = el("ttsRate");
    if (rateSelect) {
      rateSelect.value = String(speechRate);
      rateSelect.addEventListener("change", function () {
        speechRate = Number(rateSelect.value);
      });
    }

    var ttsBtn = el("ttsBtn");
    if (ttsBtn) ttsBtn.addEventListener("click", readAloud);

    var radios = host.querySelectorAll('input[type="radio"]');
    for (var i = 0; i < radios.length; i++) {
      (function (radio, idx) {
        radio.addEventListener("change", function () {
          answers[q.id] = radio.value;
          picked[q.id] = idx;
          render();
        });
      })(radios[i], i);
    }

    var essay = el("essayInput");
    if (essay) {
      essay.addEventListener("input", function () {
        answers[q.id] = essay.value;
        var counter = el("wordCount");
        if (counter) counter.textContent = wordCount(essay.value) + " words";
        renderNavigator();
      });
      essay.addEventListener("paste", function (e) {
        e.preventDefault();
        recordViolation("copy-paste", "Paste attempt blocked");
      });
    }

    var prev = el("prevBtn");
    if (prev) {
      prev.addEventListener("click", function () {
        if (index > 0) {
          index--;
          stopSpeech();
          render();
        }
      });
    }

    var next = el("nextBtn");
    if (next) {
      next.addEventListener("click", function () {
        if (index === exam.questions.length - 1) {
          finishExam("manual");
        } else {
          index++;
          stopSpeech();
          render();
        }
      });
    }
  }

  function wordCount(text) {
    var trimmed = String(text || "").trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function renderProctor() {
    var count = el("violationCount");
    if (count) count.textContent = violations.length + " / " + exam.threshold;

    var pips = el("violationPips");
    if (pips) {
      var html = "";
      for (var i = 0; i < exam.threshold; i++) {
        html += '<span class="' + (i < violations.length ? "is-hit" : "") + '"></span>';
      }
      pips.innerHTML = html;
    }

    var note = el("violationNote");
    if (note) {
      var remaining = Math.max(0, exam.threshold - violations.length);
      note.textContent = submitted
        ? "Maximum violations reached. The exam was submitted automatically."
        : remaining + " warning" + (remaining === 1 ? "" : "s") + " remaining before automatic submission.";
    }

    var log = el("violationLog");
    if (log) {
      log.innerHTML = violations.length
        ? violations
            .map(function (v) {
              return (
                '<li class="entry"><p>' + esc(v.label) + "</p><p>" + esc(v.time) + "</p></li>"
              );
            })
            .join("")
        : '<li class="muted">No violations recorded.</li>';
    }
  }

  function renderTimer() {
    var node = el("timerValue");
    if (node) node.textContent = timeLabel();
  }

  function render() {
    renderNavigator();
    renderQuestion();
    renderProctor();
    renderTimer();
  }

  /* ---------- submission ---------- */

  function submitToServer(mode, attempt) {
    return API.post("submit.php", { exam_id: exam.id, answers: answers, mode: mode }).catch(function (e) {
      if (e.status && e.status < 500 && e.status !== 0) return { error: e.message };
      if (attempt >= 3) return { offline: true };
      return new Promise(function (res) { window.setTimeout(res, 1500); }).then(function () {
        return submitToServer(mode, attempt + 1);
      });
    });
  }

  function finishExam(mode, reason, result) {
    if (submitted) return;
    submitted = mode;
    stopSpeech();
    stopCamera();
    if (timerId) window.clearInterval(timerId);
    if (hbId) window.clearInterval(hbId);
    var lockEl = el("camLock"); if (lockEl) lockEl.remove();

    var left = timeLabel();
    var ready = result ? Promise.resolve(result) : submitToServer(mode, 0);
    ready.then(function (res) {
      var auto = mode === "auto";
      var offline = res && res.offline;
      var why = reason === "time" ? "The time allowed for this examination expired."
        : reason === "instructor" ? "Your instructor ended your session."
        : "Your session reached the maximum of " + exam.threshold + " violations.";
      document.body.innerHTML =
        '<main class="submitted"><div class="submitted__card">' +
        '<div class="submitted__icon' + (auto ? " is-auto" : "") + '">' + (auto ? "!" : "✓") + "</div>" +
        "<h1>" + (auto ? "Examination auto-submitted" : "Examination submitted") + "</h1>" +
        "<p>" +
        (offline ? "We could not reach the server. Do not close this tab - reload this page once you are back online. "
          : auto ? why + " Your answers were locked and forwarded to your professor together with the violation report."
          : "Your answers have been recorded. Results will be released by your professor.") +
        "</p>" +
        '<dl class="submitted__stats">' +
        "<div><dt>Answered</dt><dd>" + answeredCount() + "/" + exam.questions.length + "</dd></div>" +
        '<div><dt>Violations</dt><dd class="is-danger">' + violations.length + "</dd></div>" +
        "<div><dt>Time left</dt><dd>" + left + "</dd></div>" +
        "</dl>" +
        '<a class="btn btn--primary" href="student-dashboard.html">Back to dashboard</a>' +
        "</div></main>";
    });
  }

  /* ---------- boot ---------- */

  function showError(title, message) {
    document.body.innerHTML =
      '<main class="submitted"><div class="submitted__card"><h1>' + esc(title) + "</h1><p>" + esc(message) + "</p>" +
      '<a class="btn btn--primary" href="student-exam-dashboard.html">Back to my exams</a></div></main>';
    document.documentElement.style.visibility = "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!el("questionHost")) return;
    if (!examId) { showError("Examination not found", "No exam was selected."); return; }

    Session.ready.then(function () {
      return API.get("exam.php?action=start&id=" + encodeURIComponent(examId));
    }).then(function (data) {
      exam = data.exam;
      answers = data.draft || {};
      violations = (data.violations || []).map(function (v) { return v; });
      secondsLeft = data.secondsLeft;
      boot();
    }).catch(function (e) {
      showError("Cannot open examination", e.message);
    });
  });

  function boot() {
    if (el("examCode")) el("examCode").textContent = exam.code + " · " + exam.title;
    if (el("examSubject")) el("examSubject").textContent = exam.subject;
    document.title = exam.code + " " + exam.title + " | EXAM PLMu";
    if (DEMO && el("simulator")) el("simulator").hidden = false;

    var submitBtn = el("submitBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        if (window.confirm("Submit your exam now? You cannot change your answers afterwards.")) finishExam("manual");
      });
    }

    var sim = document.querySelectorAll("[data-simulate]");
    for (var i = 0; i < sim.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          recordViolation(btn.getAttribute("data-simulate"), btn.getAttribute("data-label"));
        });
      })(sim[i]);
    }

    bindAntiCheat();
    startCamera();
    render();
    heartbeat();
    hbId = window.setInterval(heartbeat, 5000);

    timerId = window.setInterval(function () {
      if (submitted) return;
      secondsLeft--;
      if (secondsLeft <= 0) {
        secondsLeft = 0;
        renderTimer();
        finishExam("auto", "time");
        return;
      }
      renderTimer();
    }, 1000);
  }
})();
