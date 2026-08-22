/**
 * The one page on the site that ships meaningful client-side JS —
 * CLAUDE.md: "islands architecture (only the intake flow ships JS)."
 * Talks to /api/intake/* (src/pages/api/intake/**) which is the only
 * real (not stubbed) write path in the app — KV/D1 persistence is real,
 * only the external notifications (email/Slack) are logged stubs.
 */

interface IntakeField {
  id: string;
  label: string;
  kind: "text" | "textarea" | "select" | "boolean" | "photo";
  options?: string[];
}

const intakeQuestionsData: Record<string, IntakeField[]> = JSON.parse(
  document.getElementById("intake-questions-data")?.textContent || "{}",
);

// Cast via `unknown`: @cloudflare/workers-types' ambient globals (needed
// for the server-side env.PROJECTS_KV/env.DB typing elsewhere in this
// project) redefine Element in a way that structurally conflicts with
// lib.dom's HTMLSelectElement etc. in a single shared tsconfig. A direct
// cast trips that conflict; a double cast sidesteps it safely for what
// is, at the end of the day, just "trust me, this element exists."
function byId<T = HTMLElement>(id: string): T {
  return document.getElementById(id) as unknown as T;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

const STORAGE_KEY = "thi_intake_session";
const TOTAL_STEPS = 6;

interface StoredSession {
  projectId: string;
  token: string;
}

let projectId: string | null = null;
let token: string | null = null;
let selectedService: string | null = null;
let selectedLocation: string | null = null;
let currentStep = 1;
let answeredFields: Record<string, string> = {};

const steps = Array.from(document.querySelectorAll<HTMLElement>(".intake-step"));
const progress = document.getElementById("progress");
const nextBtn = byId<HTMLButtonElement>("next-btn");
const backBtn = byId<HTMLButtonElement>("back-btn");
const formError = byId("form-error");

function showError(message: string) {
  formError.textContent = message;
  formError.style.display = "block";
}
function clearError() {
  formError.style.display = "none";
  formError.textContent = "";
}

function saveSession() {
  if (projectId && token) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId, token } satisfies StoredSession));
  }
}
function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

function render() {
  steps.forEach((el) => {
    el.style.display = String(el.dataset.step) === String(currentStep) ? "block" : "none";
  });
  if (progress) {
    Array.from(progress.children).forEach((dot, i) => {
      dot.classList.toggle("done", i < currentStep);
    });
  }
  backBtn.style.visibility = currentStep === 1 ? "hidden" : "visible";
  nextBtn.textContent = currentStep === TOTAL_STEPS ? "Generate My Brief" : "Continue";
  if (currentStep === 6) renderReview();
}

function renderReview() {
  const summary = document.getElementById("review-summary");
  if (!summary) return;
  const parts: string[] = [];
  if (selectedService) parts.push(`Project: ${selectedService}`);
  if (selectedLocation) parts.push(`Location: ${selectedLocation}`);
  const answeredCount = Object.keys(answeredFields).length;
  parts.push(`${answeredCount} question${answeredCount === 1 ? "" : "s"} answered so far.`);
  summary.textContent = parts.join(" — ");
}

function selectChoice(groupId: string, value: string) {
  document.querySelectorAll<HTMLElement>(`#${groupId} .choice-card`).forEach((card) => {
    card.classList.toggle("selected", card.dataset.value === value);
  });
}

function renderServiceFields(serviceSlug: string) {
  const note = document.getElementById("service-specific-note");
  const wrap = document.getElementById("service-specific-fields");
  if (!wrap || !note) return;
  const fields = intakeQuestionsData[serviceSlug];
  wrap.innerHTML = "";
  if (!fields) {
    note.textContent = "Select a service in step 2 to see relevant questions.";
    return;
  }
  note.textContent = "Answer what you can — anything you skip is fine, we'll flag it as unknown rather than guess.";
  for (const field of fields) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const existing = answeredFields[field.id] ?? "";
    if (field.kind === "select" && field.options) {
      const options: string[] = field.options;
      wrapper.innerHTML = `<label>${field.label}</label><select data-field-id="${field.id}"><option value="">Not sure / skip</option>${options
        .map((o: string) => `<option value="${o}" ${o === existing ? "selected" : ""}>${o}</option>`)
        .join("")}</select>`;
    } else if (field.kind === "boolean") {
      wrapper.innerHTML = `<label>${field.label}</label><select data-field-id="${field.id}"><option value="">Not sure / skip</option><option value="true" ${existing === "true" ? "selected" : ""}>Yes</option><option value="false" ${existing === "false" ? "selected" : ""}>No</option></select>`;
    } else if (field.kind === "photo") {
      wrapper.innerHTML = `<label>${field.label}</label><input type="file" disabled /><p style="font-size:0.78rem;color:var(--ink-soft);margin-top:4px;">Photo upload isn't implemented yet.</p>`;
    } else if (field.kind === "textarea") {
      wrapper.innerHTML = `<label>${field.label}</label><textarea data-field-id="${field.id}">${existing}</textarea>`;
    } else {
      wrapper.innerHTML = `<label>${field.label}</label><input type="text" data-field-id="${field.id}" value="${existing}" />`;
    }
    wrap.appendChild(wrapper);
  }
}

type AnswerElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function collectServiceFieldAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  document.querySelectorAll<HTMLElement>("#service-specific-fields [data-field-id]").forEach((el) => {
    const input = el as AnswerElement;
    const id = input.dataset.fieldId!;
    const value = input.value.trim();
    if (value) out[id] = value;
  });
  return out;
}

interface ProjectPayload {
  answers: Record<string, string>;
  service: string;
  location: string;
}

async function apiStart(firstName: string, email: string) {
  const res = await fetch("/api/intake/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstName, email }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not start your project."));
  return (await res.json()) as { projectId: string; token: string };
}

async function apiPatch(patch: Record<string, string>) {
  if (!projectId || !token) throw new Error("Missing project session.");
  const res = await fetch(`/api/intake/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, patch }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not save your answers."));
  const data = (await res.json()) as { project: ProjectPayload };
  answeredFields = data.project.answers;
  return data.project;
}

async function apiResume(id: string, tok: string) {
  const res = await fetch(`/api/intake/${id}?token=${encodeURIComponent(tok)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { project: ProjectPayload };
  return data.project;
}

async function apiComplete() {
  if (!projectId || !token) throw new Error("Missing project session.");
  const res = await fetch(`/api/intake/${projectId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not generate your brief."));
  return res.json();
}

async function goNext() {
  clearError();
  nextBtn.disabled = true;
  try {
    if (currentStep === 1) {
      const firstName = byId<HTMLInputElement>("first-name").value.trim();
      const email = byId<HTMLInputElement>("email").value.trim();
      if (!firstName || !email) {
        showError("First name and email are required to start.");
        return;
      }
      if (!projectId) {
        const started = await apiStart(firstName, email);
        projectId = started.projectId;
        token = started.token;
        saveSession();
      }
    } else if (currentStep === 2) {
      if (!selectedService || !selectedLocation) {
        showError("Please choose a city and a project type.");
        return;
      }
      await apiPatch({ service: selectedService, location: selectedLocation });
      renderServiceFields(selectedService);
    } else if (currentStep === 3) {
      const overview = byId<HTMLTextAreaElement>("overview").value.trim();
      const urgency = byId<HTMLSelectElement>("urgency").value.trim();
      const address = byId<HTMLInputElement>("address").value.trim();
      const patch: Record<string, string> = {};
      if (overview) patch.overview = overview;
      if (urgency) patch.urgency = urgency;
      if (address) patch.address = address;
      if (Object.keys(patch).length) await apiPatch(patch);
    } else if (currentStep === 4) {
      const patch = collectServiceFieldAnswers();
      if (Object.keys(patch).length) await apiPatch(patch);
    } else if (currentStep === 5) {
      const priorWork = byId<HTMLTextAreaElement>("prior-work").value.trim();
      const objectives = byId<HTMLInputElement>("objectives").value.trim();
      const patch: Record<string, string> = {};
      if (priorWork) patch.priorWork = priorWork;
      if (objectives) patch.objectives = objectives;
      if (Object.keys(patch).length) await apiPatch(patch);
    } else if (currentStep === TOTAL_STEPS) {
      await apiComplete();
      window.location.href = `/brief/${projectId}/?token=${encodeURIComponent(token!)}`;
      return;
    }
    currentStep = Math.min(TOTAL_STEPS, currentStep + 1);
    render();
  } catch (err) {
    showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
  } finally {
    nextBtn.disabled = false;
  }
}

function goBack() {
  clearError();
  currentStep = Math.max(1, currentStep - 1);
  render();
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const serviceCard = target.closest<HTMLElement>("#service-choices .choice-card");
  if (serviceCard) {
    selectedService = serviceCard.dataset.value ?? null;
    selectChoice("service-choices", selectedService!);
    return;
  }
  const locationCard = target.closest<HTMLElement>("#location-choices .choice-card");
  if (locationCard) {
    selectedLocation = locationCard.dataset.value ?? null;
    selectChoice("location-choices", selectedLocation!);
  }
});

nextBtn.addEventListener("click", goNext);
backBtn.addEventListener("click", goBack);

async function init() {
  const params = new URLSearchParams(window.location.search);
  const resumeId = params.get("resume");
  const resumeToken = params.get("token");
  const stored = loadSession();

  if (resumeId && resumeToken) {
    const project = await apiResume(resumeId, resumeToken);
    if (project) {
      projectId = resumeId;
      token = resumeToken;
      selectedService = project.service || null;
      selectedLocation = project.location || null;
      answeredFields = project.answers;
      saveSession();
      currentStep = selectedService ? 3 : 2;
    }
  } else if (stored) {
    const project = await apiResume(stored.projectId, stored.token);
    if (project) {
      projectId = stored.projectId;
      token = stored.token;
      selectedService = project.service || null;
      selectedLocation = project.location || null;
      answeredFields = project.answers;
      currentStep = selectedService ? 3 : 2;
    }
  }

  const preService = params.get("service");
  const preLocation = params.get("location");
  if (!selectedService && preService && intakeQuestionsData[preService]) {
    selectedService = preService;
  }
  if (!selectedLocation && preLocation) {
    selectedLocation = preLocation;
  }
  if (selectedService) selectChoice("service-choices", selectedService);
  if (selectedLocation) selectChoice("location-choices", selectedLocation);
  if (selectedService) renderServiceFields(selectedService);

  render();
}

init();
