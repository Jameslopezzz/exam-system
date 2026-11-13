/* =========================================================
   Shared helpers: escaping, navigation state, modals
   ========================================================= */

function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function el(id) {
  return document.getElementById(id);
}

/* Marks the nav link matching the current file as active. */
function markActiveNav() {
  var here = window.location.pathname.split("/").pop() || "index.html";
  var links = document.querySelectorAll(".nav a");
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute("href");
    if (href === here) links[i].classList.add("is-active");
  }
}

/* Simple modal open / close wiring for [data-modal] triggers. */
function initModals() {
  var openers = document.querySelectorAll("[data-modal-open]");
  for (var i = 0; i < openers.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        openModal(btn.getAttribute("data-modal-open"));
      });
    })(openers[i]);
  }

  var closers = document.querySelectorAll("[data-modal-close]");
  for (var j = 0; j < closers.length; j++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        closeModal(btn.getAttribute("data-modal-close"));
      });
    })(closers[j]);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var open = document.querySelectorAll(".modal:not([hidden])");
    for (var k = 0; k < open.length; k++) open[k].hidden = true;
  });
}

function openModal(id) {
  var node = el(id);
  if (node) node.hidden = false;
}

function closeModal(id) {
  var node = el(id);
  if (node) node.hidden = true;
}

document.addEventListener("DOMContentLoaded", function () {
  markActiveNav();
  initModals();
});
