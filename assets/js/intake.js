(function () {
  var steps = Array.prototype.slice.call(document.querySelectorAll(".intake-step"));
  var total = steps.length;
  var current = 1;
  var nextBtn = document.getElementById("next-btn");
  var backBtn = document.getElementById("back-btn");
  var progress = document.getElementById("progress");
  var selectedService = null;

  function params() {
    var p = {};
    (window.location.search || "").replace(/^\?/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split("=");
      p[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });
    return p;
  }

  function render() {
    steps.forEach(function (el) {
      el.style.display = String(el.getAttribute("data-step")) === String(current) ? "block" : "none";
    });
    if (progress) {
      Array.prototype.slice.call(progress.children).forEach(function (dot, i) {
        dot.classList.toggle("done", i < current);
      });
    }
    backBtn.style.visibility = current === 1 ? "hidden" : "visible";
    nextBtn.textContent = current === total ? "Generate My Brief" : "Continue";
  }

  function selectService(slug) {
    selectedService = slug;
    document.querySelectorAll("#service-choices .choice-card").forEach(function (card) {
      card.classList.toggle("selected", card.getAttribute("data-value") === slug);
    });
    var note = document.getElementById("service-specific-note");
    var wrap = document.getElementById("service-specific-fields");
    var qs = (window.THI_SERVICE_QUESTIONS || {})[slug];
    wrap.innerHTML = "";
    if (qs) {
      note.textContent = "These are the questions QuoteReady would ask for this service:";
      qs.forEach(function (q, i) {
        var field = document.createElement("div");
        field.className = "field";
        field.innerHTML = '<label>' + q + '</label><input type="text" placeholder="Your answer">';
        wrap.appendChild(field);
      });
    }
  }

  document.addEventListener("click", function (e) {
    var card = e.target.closest && e.target.closest("#service-choices .choice-card");
    if (card) selectService(card.getAttribute("data-value"));
  });

  nextBtn.addEventListener("click", function () {
    if (current === total) {
      window.location.href = "/brief-sample/";
      return;
    }
    current = Math.min(total, current + 1);
    render();
  });
  backBtn.addEventListener("click", function () {
    current = Math.max(1, current - 1);
    render();
  });

  var initial = params();
  if (initial.service) {
    setTimeout(function () { selectService(initial.service); }, 0);
  }

  render();
})();
