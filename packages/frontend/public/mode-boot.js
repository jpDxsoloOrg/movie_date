/*
 * Paints the right mode before the app has loaded, so /shows doesn't open in the Movies
 * theme. A file because the site's CSP allows no inline script. It only ever chooses
 * Going Steady and only reads the colour, which stays in themes.css. The rules are
 * modeOfPath's and ModeProvider's, and those take over once the app starts.
 */
(function bootMode() {
  var path = location.pathname;
  var remembered = null;
  try {
    remembered = localStorage.getItem("movieDateMode");
  } catch (error) {
    // Blocked storage only means this visit starts on what the URL says.
  }
  var shows = /^\/shows(\/|$)/.test(path);
  var movieOrPublic = /^\/(filters|match|login|register|forgot-password)(\/|$)/.test(path);
  if (!shows && (remembered !== "TV" || movieOrPublic)) return;

  var root = document.documentElement;
  root.dataset.theme = "shows";
  var colour = getComputedStyle(root).getPropertyValue("--theme-status-bar").trim();
  var meta = document.querySelector('meta[name="theme-color"]');
  if (colour && meta) meta.setAttribute("content", colour);
})();
