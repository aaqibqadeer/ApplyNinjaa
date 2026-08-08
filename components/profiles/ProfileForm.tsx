"use client";

import { useState, type FormEvent } from "react";

import { ProfileDocuments } from "@/components/profiles/ProfileDocuments";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPLOYMENT_TYPES,
  WORK_ARRANGEMENTS,
  WORK_AUTHORIZATIONS,
} from "@/lib/db/schema";
import type {
  CustomFieldValue,
  EducationValue,
  ExperienceValue,
  ProfileFormValues,
  ProjectValue,
} from "@/lib/profiles/form-values";

/* EEO answer sets (standard US self-identification forms). Stored encrypted
 * server-side; only collected behind the explicit consent checkbox below. */
const EEO_GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const EEO_RACES = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Two or More Races",
  "Prefer not to say",
];
const EEO_VETERAN = [
  "I am a protected veteran",
  "I am not a protected veteran",
  "Prefer not to say",
];
const EEO_DISABILITY = [
  "Yes, I have a disability (or previously had one)",
  "No, I do not have a disability",
  "Prefer not to say",
];

export interface ProfileFormProps {
  initial: ProfileFormValues;
  submitLabel: string;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
}

/**
 * Full profile editor — every parsed field is editable (product spec §1.3).
 * The EEO section only unlocks behind an explicit, unchecked-by-default
 * consent checkbox; consent off means nothing demographic is submitted.
 */
export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
}: ProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [skillsText, setSkillsText] = useState(initial.skills.join(", "));
  const [eeoConsent, setEeoConsent] = useState(Boolean(initial.eeo?.consent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }
  function setContact(key: string, value: string) {
    setValues((v) => ({
      ...v,
      contact: { ...v.contact, [key]: value || null },
    }));
  }
  function setLink(key: string, value: string) {
    setValues((v) => ({ ...v, links: { ...v.links, [key]: value || null } }));
  }
  function setEeoField(key: string, value: string) {
    setValues((v) => ({
      ...v,
      eeo: {
        consent: true,
        gender: v.eeo?.gender ?? null,
        raceEthnicity: v.eeo?.raceEthnicity ?? null,
        veteranStatus: v.eeo?.veteranStatus ?? null,
        disabilityStatus: v.eeo?.disabilityStatus ?? null,
        [key]: value || null,
      },
    }));
  }
  function setExperience(index: number, patch: Partial<ExperienceValue>) {
    setValues((v) => ({
      ...v,
      experience: v.experience.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    }));
  }
  function setEducation(index: number, patch: Partial<EducationValue>) {
    setValues((v) => ({
      ...v,
      education: v.education.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    }));
  }
  function setCustomField(index: number, patch: Partial<CustomFieldValue>) {
    setValues((v) => ({
      ...v,
      customFields: v.customFields.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    }));
  }
  function setProject(index: number, patch: Partial<ProjectValue>) {
    setValues((v) => ({
      ...v,
      projects: v.projects.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        ...values,
        skills: skillsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        eeo: eeoConsent
          ? {
              consent: true,
              gender: values.eeo?.gender ?? null,
              raceEthnicity: values.eeo?.raceEthnicity ?? null,
              veteranStatus: values.eeo?.veteranStatus ?? null,
              disabilityStatus: values.eeo?.disabilityStatus ?? null,
            }
          : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  const contactFields: Array<[string, string]> = [
    ["firstName", "First name"],
    ["lastName", "Last name"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["address", "Street address"],
    ["city", "City"],
    ["state", "State"],
    ["zip", "ZIP"],
    ["country", "Country"],
  ];
  const linkFields: Array<[string, string]> = [
    ["linkedin", "LinkedIn"],
    ["github", "GitHub"],
    ["portfolio", "Portfolio"],
    ["other", "Other"],
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Profile name</Label>
        <Input
          id="profile-name"
          required
          maxLength={60}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder='e.g. "Frontend" or "Backend/AI"'
          className="max-w-xs"
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Contact</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {contactFields.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`contact-${key}`}>{label}</Label>
              <Input
                id={`contact-${key}`}
                value={values.contact[key] ?? ""}
                onChange={(e) => setContact(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="profile-summary">Professional summary</Label>
        <Textarea
          id="profile-summary"
          value={values.summary ?? ""}
          onChange={(e) => set("summary", e.target.value || null)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="profile-skills">Skills (comma-separated)</Label>
        <Textarea
          id="profile-skills"
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="React, TypeScript, Node.js"
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Experience</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("experience", [
                ...values.experience,
                { title: "", company: "", current: false },
              ])
            }
          >
            Add role
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          {values.experience.map((exp, i) => (
            <div key={i} className="border-border rounded-lg border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-title-${i}`}>Title</Label>
                  <Input
                    id={`exp-title-${i}`}
                    value={exp.title}
                    onChange={(e) =>
                      setExperience(i, { title: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-company-${i}`}>Company</Label>
                  <Input
                    id={`exp-company-${i}`}
                    value={exp.company}
                    onChange={(e) =>
                      setExperience(i, { company: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-start-${i}`}>Start</Label>
                  <Input
                    id={`exp-start-${i}`}
                    placeholder="Jun 2022"
                    value={exp.startDate ?? ""}
                    onChange={(e) =>
                      setExperience(i, { startDate: e.target.value || null })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`exp-end-${i}`}>End</Label>
                  <Input
                    id={`exp-end-${i}`}
                    placeholder="Present"
                    disabled={exp.current}
                    value={exp.endDate ?? ""}
                    onChange={(e) =>
                      setExperience(i, { endDate: e.target.value || null })
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor={`exp-desc-${i}`}>Description</Label>
                <Textarea
                  id={`exp-desc-${i}`}
                  value={exp.description ?? ""}
                  onChange={(e) =>
                    setExperience(i, { description: e.target.value || null })
                  }
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exp.current}
                    onChange={(e) =>
                      setExperience(i, { current: e.target.checked })
                    }
                  />
                  I currently work here
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set(
                      "experience",
                      values.experience.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Education</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("education", [...values.education, { school: "" }])
            }
          >
            Add school
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          {values.education.map((edu, i) => (
            <div
              key={i}
              className="border-border grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`edu-school-${i}`}>School</Label>
                <Input
                  id={`edu-school-${i}`}
                  value={edu.school}
                  onChange={(e) => setEducation(i, { school: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`edu-degree-${i}`}>Degree</Label>
                <Input
                  id={`edu-degree-${i}`}
                  value={edu.degree ?? ""}
                  onChange={(e) =>
                    setEducation(i, { degree: e.target.value || null })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`edu-field-${i}`}>Field of study</Label>
                <Input
                  id={`edu-field-${i}`}
                  value={edu.field ?? ""}
                  onChange={(e) =>
                    setEducation(i, { field: e.target.value || null })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`edu-end-${i}`}>Graduation</Label>
                <Input
                  id={`edu-end-${i}`}
                  placeholder="May 2024"
                  value={edu.endDate ?? ""}
                  onChange={(e) =>
                    setEducation(i, { endDate: e.target.value || null })
                  }
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set(
                      "education",
                      values.education.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("projects", [
                ...values.projects,
                { name: "", technologies: [] },
              ])
            }
          >
            Add project
          </Button>
        </div>
        <div className="flex flex-col gap-4">
          {values.projects.map((project, i) => (
            <div key={i} className="border-border rounded-lg border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`project-name-${i}`}>Name</Label>
                  <Input
                    id={`project-name-${i}`}
                    value={project.name}
                    onChange={(e) => setProject(i, { name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`project-url-${i}`}>Link</Label>
                  <Input
                    id={`project-url-${i}`}
                    placeholder="https://…"
                    value={project.url ?? ""}
                    onChange={(e) =>
                      setProject(i, { url: e.target.value || null })
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor={`project-tech-${i}`}>
                  Technologies (comma-separated)
                </Label>
                <Input
                  id={`project-tech-${i}`}
                  placeholder="Next.js, Postgres"
                  value={project.technologies.join(", ")}
                  onChange={(e) =>
                    setProject(i, {
                      technologies: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor={`project-desc-${i}`}>Description</Label>
                <Textarea
                  id={`project-desc-${i}`}
                  value={project.description ?? ""}
                  onChange={(e) =>
                    setProject(i, { description: e.target.value || null })
                  }
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set(
                      "projects",
                      values.projects.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Links</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {linkFields.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`link-${key}`}>{label}</Label>
              <Input
                id={`link-${key}`}
                value={values.links[key] ?? ""}
                onChange={(e) => setLink(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Job preferences</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-auth">Work authorization</Label>
            <Select
              id="pref-auth"
              value={values.workAuthorization ?? ""}
              onChange={(e) => set("workAuthorization", e.target.value || null)}
            >
              <option value="">Select…</option>
              {WORK_AUTHORIZATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-arrangement">Work arrangement</Label>
            <Select
              id="pref-arrangement"
              value={values.workArrangement ?? ""}
              onChange={(e) => set("workArrangement", e.target.value || null)}
            >
              <option value="">Select…</option>
              {WORK_ARRANGEMENTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-salary">Salary expectation</Label>
            <Input
              id="pref-salary"
              placeholder="$120,000"
              value={values.salaryExpectation ?? ""}
              onChange={(e) => set("salaryExpectation", e.target.value || null)}
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm leading-none font-medium">
              Employment types
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {EMPLOYMENT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={values.employmentTypes.includes(type)}
                    onChange={(e) =>
                      set(
                        "employmentTypes",
                        e.target.checked
                          ? [...values.employmentTypes, type]
                          : values.employmentTypes.filter((t) => t !== type),
                      )
                    }
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Saved answers</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("customFields", [
                ...values.customFields,
                { label: "", value: "" },
              ])
            }
          >
            Add answer
          </Button>
        </div>
        <p className="text-muted-foreground mb-3 text-xs">
          Questions you answer over and over. Quick Fill matches these by label
          before anything else, so a saved answer always wins over a guess — and
          they cost no AI actions.
        </p>
        <div className="flex flex-col gap-3">
          {values.customFields.map((field, i) => (
            <div
              key={i}
              className="border-border grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_2fr_auto]"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`custom-label-${i}`}>Question</Label>
                <Input
                  id={`custom-label-${i}`}
                  placeholder="Years of experience"
                  value={field.label}
                  onChange={(e) => setCustomField(i, { label: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`custom-value-${i}`}>Answer</Label>
                <Input
                  id={`custom-value-${i}`}
                  placeholder="6"
                  value={field.value}
                  onChange={(e) => setCustomField(i, { value: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set(
                      "customFields",
                      values.customFields.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ProfileDocuments
        documents={values.documents}
        onChange={(documents) => set("documents", documents)}
      />

      <section className="flex flex-col gap-2">
        <Label htmlFor="profile-knowledge">Background notes</Label>
        <p className="text-muted-foreground -mt-1 text-xs">
          Anything you&rsquo;d want an assistant to know when writing an answer
          for you — motivations, context on a career gap, what you&rsquo;re
          looking for. Used by AI Fill for open-ended questions; never sent
          anywhere else.
        </p>
        <Textarea
          id="profile-knowledge"
          rows={6}
          maxLength={10000}
          value={values.knowledgeBase}
          onChange={(e) => set("knowledgeBase", e.target.value)}
          placeholder="I'm moving from consulting into product engineering because…"
        />
      </section>

      <section className="border-border rounded-lg border p-4">
        <label className="flex items-start gap-3">
          <Checkbox
            checked={eeoConsent}
            onChange={(e) => setEeoConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">
              Optional: store my EEO/demographic answers
            </span>
            <span className="text-muted-foreground mt-1 block text-xs">
              Many US applications include voluntary self-identification
              questions (gender, race/ethnicity, veteran and disability status).
              If you consent, we store your answers <strong>encrypted</strong>{" "}
              and use them only to fill those questions for you. This is
              entirely optional — leaving it off never affects your
              applications, and you can clear the answers at any time.
            </span>
          </span>
        </label>

        {eeoConsent && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["gender", "Gender", EEO_GENDERS],
                ["raceEthnicity", "Race / ethnicity", EEO_RACES],
                ["veteranStatus", "Veteran status", EEO_VETERAN],
                ["disabilityStatus", "Disability status", EEO_DISABILITY],
              ] as const
            ).map(([key, label, options]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`eeo-${key}`}>{label}</Label>
                <Select
                  id={`eeo-${key}`}
                  value={values.eeo?.[key] ?? ""}
                  onChange={(e) => setEeoField(key, e.target.value)}
                >
                  <option value="">Select…</option>
                  {options.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
