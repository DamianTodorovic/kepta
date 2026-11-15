(function () {
  try {
    if (localStorage.getItem("theme-werkbank") === "dark") {
      document.documentElement.classList.add("dark");
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", "#0e0f11");
    }
  } catch (e) {}
})();
