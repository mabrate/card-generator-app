"use strict";
const byId = (id) => document.getElementById(id);
async function api(path, body) {
  const options = body === undefined ? {} : {method: "POST", headers: {"Content-Type": "application/json", "X-Card-App": "1"}, body: JSON.stringify(body)};
  let response;
  try { response = await fetch(path, options); }
  catch { throw new Error("Cannot reach the classroom computer. Check your Wi-Fi connection, then reload to reconnect."); }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The request could not be processed. Check your text and try again.");
  return data;
}
function showError(error) { byId("page-error").textContent = error.message; }
async function student() {
  const [project, examples] = await Promise.all([api("/api/project"), api("/api/examples")]);
  const fields = project.template.fields;
  let labels = {}, values = {}, theme = "sage", revision = 0, timer;
  const inputs = new Map();
  for (const field of fields) {
    const wrapper = document.createElement("div");
    const heading = document.createElement("div"); heading.className = "field-heading";
    const label = document.createElement("label"); label.htmlFor = field.key; label.textContent = field.label;
    const count = document.createElement("span"); count.className = "counter"; count.id = field.key + "-count";
    const input = document.createElement(field.key.startsWith("section_") || field.key === "intro_text" ? "textarea" : "input");
    input.id = field.key; input.name = field.key; input.setAttribute("aria-describedby", count.id); input.autocomplete = "off";
    // Retain pasted/fixture text in full. An over-limit value is explicitly invalid.
    input.addEventListener("input", () => { values[field.key] = input.value; updateCount(field); schedule(); });
    heading.append(label, count); wrapper.append(heading, input); byId("fields").append(wrapper);
    inputs.set(field.key, {input, label, count});
  }
  function updateCount(field) {
    const entry = inputs.get(field.key), length = Array.from(entry.input.value).length;
    entry.count.textContent = `${length} / ${field.max_chars}`;
    entry.count.classList.toggle("over", length > field.max_chars);
  }
  for (const item of project.themes.filter(t => project.template.themes.includes(t.id))) {
    const label = document.createElement("label"); label.className = "theme-option";
    const radio = document.createElement("input"); radio.type = "radio"; radio.name = "theme"; radio.value = item.id; radio.checked = item.id === theme;
    radio.addEventListener("change", () => { theme = item.id; schedule(); });
    label.append(radio, document.createTextNode(item.name)); byId("themes").append(label);
  }
  const select = byId("example"); select.replaceChildren();
  examples.forEach((example, index) => { const option = document.createElement("option"); option.value = index; option.textContent = example.name; select.append(option); });
  select.disabled = false;
  function chooseExample() {
    const example = examples[Number(select.value)]; values = {...example.values}; labels = {...example.labels};
    fields.forEach(field => { const entry = inputs.get(field.key); entry.input.value = values[field.key] || ""; entry.label.textContent = labels[field.key] || field.label; updateCount(field); });
    byId("example-note").textContent = example.kind ? `Read-only source example · ${example.kind} · ${example.copies} requested copies. Editing this preview does not change the source or import a record.` : "A field-guide example. Change its text to try the fixed layout.";
    schedule();
  }
  function schedule() {
    clearTimeout(timer); const current = ++revision;
    byId("card-preview").setAttribute("aria-busy", "true");
    byId("fit-status").textContent = "Checking text fit…";
    timer = setTimeout(() => render(current), 250);
  }
  async function render(current) {
    try {
      const result = await api("/api/preview", {values, labels, theme});
      if (current !== revision) return;
      byId("page-error").textContent = "";
      byId("card-preview").innerHTML = result.svg;
      byId("card-preview").setAttribute("aria-busy", "false");
      byId("fit-status").textContent = result.valid ? "✓ Text fits the fixed card layout." : "Text needs attention — see the details below.";
      byId("fit-status").classList.toggle("invalid", !result.valid);
      byId("issues").replaceChildren();
      const invalid = new Set(result.issues.map(issue => issue.field.replace(/-label$/, "")));
      inputs.forEach((entry, key) => entry.input.setAttribute("aria-invalid", String(invalid.has(key))));
      result.issues.forEach(issue => { const li = document.createElement("li"); li.textContent = issue.message; byId("issues").append(li); });
    } catch (error) {
      if (current !== revision) return;
      showError(error); byId("fit-status").textContent = "Preview unavailable — the displayed card may be out of date.";
      byId("fit-status").classList.add("invalid");
    }
  }
  byId("card-form").addEventListener("submit", event => event.preventDefault());
  select.addEventListener("change", chooseExample); chooseExample();
}
async function start() {
  const page = document.body.dataset.page;
  if (page === "home") {
    const examples = await api("/api/examples");
    const result = await api("/api/preview", {values: examples[0].values});
    byId("home-card").innerHTML = result.svg;
  } else if (page === "preview") await student();
  else if (page === "login") {
    byId("login-form").addEventListener("submit", async event => {
      event.preventDefault(); byId("page-error").textContent = ""; byId("sign-in").disabled = true;
      try { await api("/api/teacher/login", {pin: byId("pin").value}); location.assign("/teacher"); }
      catch (error) { showError(error); byId("sign-in").disabled = false; }
    });
  } else if (page === "teacher") {
    const data = await api("/api/teacher/dashboard");
    byId("project-name").textContent = data.project.title;
    byId("database-state").textContent = "✓ Local project database is ready.";
    byId("student-url").textContent = location.origin + "/student";
    byId("local-url-note").textContent = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ? "This is a computer-only address. For iPads, replace localhost with this computer’s LAN IP address, keeping the port number." : "Use this address with the classroom computer running. No Internet connection is needed.";
    byId("logout").addEventListener("click", async () => { try { await api("/api/teacher/logout", {}); location.assign("/teacher/login"); } catch (error) { showError(error); } });
  }
}
start().catch(showError);

