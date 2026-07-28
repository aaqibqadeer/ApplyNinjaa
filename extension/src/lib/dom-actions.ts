/**
 * Functions injected into the page via chrome.scripting.executeScript.
 *
 * HARD CONSTRAINT: every exported function here is SERIALIZED and executed in
 * the page context — it must be fully self-contained (no imports, no closures
 * over module state, no references to anything outside its own body). Keep
 * helpers nested inside each function.
 */

export interface CollectedField {
  id: string;
  label: string | null;
  name: string | null;
  placeholder: string | null;
  fieldType: string | null;
  options?: string[];
}

export interface CollectedPage {
  jobText: string;
  fields: CollectedField[];
  title: string;
}

/**
 * Read the page: job text (body innerText, clipped) + visible form fields.
 * Tags each detected element with data-applyninjaa-id so a later fill call
 * can find it again. Generic heuristic — no per-site adapters.
 */
export function collectPageData(): CollectedPage {
  function labelFor(el: HTMLElement): string | null {
    const id = el.getAttribute("id");
    if (id) {
      const esc =
        typeof CSS !== "undefined" && CSS.escape
          ? CSS.escape(id)
          : id.replace(/([^\w-])/g, "\\$1");
      const label = document.querySelector(`label[for="${esc}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((ref) => document.getElementById(ref)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      if (text) return text;
    }
    const wrapping = el.closest("label");
    if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
    // Fall back to the nearest preceding text block (common in ATS forms).
    let node: HTMLElement | null = el;
    for (let hops = 0; node && hops < 3; hops += 1) {
      const prev = node.previousElementSibling as HTMLElement | null;
      if (prev?.textContent?.trim() && prev.textContent.trim().length < 120) {
        return prev.textContent.trim();
      }
      node = node.parentElement;
    }
    return null;
  }

  function isVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("input, textarea, select"),
  );
  const fields: CollectedField[] = [];
  let index = 0;
  for (const el of elements) {
    const type = (el.getAttribute("type") ?? el.tagName).toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(type)) {
      continue;
    }
    if (!isVisible(el)) continue;
    const id = String(index);
    el.setAttribute("data-applyninjaa-id", id);
    index += 1;
    const field: CollectedField = {
      id,
      label: labelFor(el),
      name: el.getAttribute("name"),
      placeholder: el.getAttribute("placeholder"),
      fieldType: type,
    };
    if (el instanceof HTMLSelectElement) {
      field.options = Array.from(el.options)
        .map((o) => o.text.trim())
        .filter((t) => t.length > 0)
        .slice(0, 50);
    }
    fields.push(field);
    if (fields.length >= 120) break;
  }

  const jobText = (document.body?.innerText ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 30_000);

  return { jobText, fields, title: document.title };
}

/**
 * Write mapped values into the tagged fields. Dispatches input/change events
 * so React/Vue-controlled forms notice. Returns the ids it actually filled.
 */
export function fillFields(values: Array<{ id: string; value: string }>): string[] {
  function setNativeValue(
    el: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): void {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const filled: string[] = [];
  for (const { id, value } of values) {
    const el = document.querySelector<HTMLElement>(
      `[data-applyninjaa-id="${id}"]`,
    );
    if (!el) continue;
    if (el instanceof HTMLSelectElement) {
      const match = Array.from(el.options).find(
        (o) =>
          o.text.trim().toLowerCase() === value.trim().toLowerCase() ||
          o.value.trim().toLowerCase() === value.trim().toLowerCase(),
      );
      if (!match) continue;
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      filled.push(id);
    } else if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox") {
        const wanted = ["yes", "true", "1", "on"].includes(
          value.trim().toLowerCase(),
        );
        if (el.checked !== wanted) el.click();
        filled.push(id);
      } else if (el.type === "radio") {
        // Only check a radio whose own label/value matches the value.
        const own = (el.value || "").trim().toLowerCase();
        if (own && own === value.trim().toLowerCase()) {
          el.click();
          filled.push(id);
        }
      } else if (el.type === "file") {
        // Never touch file inputs.
      } else {
        setNativeValue(el, value);
        filled.push(id);
      }
    } else if (el instanceof HTMLTextAreaElement) {
      setNativeValue(el, value);
      filled.push(id);
    }
  }
  return filled;
}

/** Describe the currently focused editable element (context-menu fill). */
export function describeActiveElement(): CollectedField | null {
  const el = document.activeElement as HTMLElement | null;
  if (
    !el ||
    !(
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    )
  ) {
    return null;
  }
  el.setAttribute("data-applyninjaa-id", "active");
  const label =
    el.getAttribute("aria-label") ??
    (el.labels && el.labels[0]?.textContent?.trim()) ??
    el.getAttribute("placeholder");
  const field: CollectedField = {
    id: "active",
    label: label ?? null,
    name: el.getAttribute("name"),
    placeholder: el.getAttribute("placeholder"),
    fieldType: (el.getAttribute("type") ?? el.tagName).toLowerCase(),
  };
  if (el instanceof HTMLSelectElement) {
    field.options = Array.from(el.options)
      .map((o) => o.text.trim())
      .filter((t) => t.length > 0)
      .slice(0, 50);
  }
  return field;
}
