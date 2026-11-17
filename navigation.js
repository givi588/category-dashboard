"use strict";

// Navigation is independent of the dashboard's persistence and editing logic.
const sidebar = document.querySelector(".sidebar");
const navToggle = document.getElementById("nav-toggle");
const navigation = document.getElementById("workspace-nav");
function closeNavigation(returnFocus = false) {
  sidebar.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
  if (returnFocus) navToggle.focus();
}
navToggle.addEventListener("click", () => {
  const open = sidebar.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(open));
});
navigation.addEventListener("click", event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  navigation.querySelectorAll("[aria-current]").forEach(item => item.removeAttribute("aria-current"));
  link.setAttribute("aria-current", "location");
  closeNavigation();
  const target = document.querySelector(link.getAttribute("href"));
  if (target) {
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
});
sidebar.addEventListener("keydown", event => {
  if (event.key === "Escape") closeNavigation(true);
});
window.matchMedia("(max-width: 800px)").addEventListener("change", () => closeNavigation());
