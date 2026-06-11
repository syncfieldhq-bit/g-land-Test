// これだけが生きていればOK
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate();
}