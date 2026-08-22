/**
 * Post-brief screen only — this element only renders once a brief
 * exists (see brief/[project_id]/index.astro), so the 1/2/3 choice is
 * structurally impossible to reach before that point, not just hidden.
 */
const container = document.getElementById("contractor-help");
if (container) {
  const projectId = container.dataset.projectId!;
  const token = container.dataset.token!;
  let selectedCount: number | null = null;

  container.querySelectorAll<HTMLElement>("#contractor-count-choices .choice-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedCount = Number(card.dataset.value);
      container
        .querySelectorAll("#contractor-count-choices .choice-card")
        .forEach((c) => c.classList.toggle("selected", c === card));
    });
  });

  const submitBtn = document.getElementById("contractor-submit") as HTMLButtonElement;
  const status = document.getElementById("contractor-status") as HTMLElement;

  submitBtn.addEventListener("click", async () => {
    if (!selectedCount) {
      status.textContent = "Please choose how many companies you'd like to hear from.";
      return;
    }
    const phone = (document.getElementById("contractor-phone") as HTMLInputElement).value.trim();
    submitBtn.disabled = true;
    status.textContent = "Sending your request...";
    try {
      const res = await fetch(`/api/intake/${projectId}/contractor-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, requestedCount: selectedCount, phone: phone || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Request failed.");
      }
      status.textContent = "Request received. Texas Home Intelligence will follow up.";
      submitBtn.disabled = true;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Something went wrong.";
      submitBtn.disabled = false;
    }
  });
}
