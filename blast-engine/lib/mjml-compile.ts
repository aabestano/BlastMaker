import mjml2html from "mjml";
import { repairMjml } from "./mjml-repair";
import { cleanHtml } from "./html";

export interface CompileResult {
  mjml: string;
  html: string;
  warnings: string[];
  errors: string[];
}

type MjmlFn = (
  input: string,
  options?: Record<string, unknown>,
) => Promise<{ html: string; errors: { formattedMessage?: string; message: string }[] }> | {
  html: string;
  errors: { formattedMessage?: string; message: string }[];
};

/**
 * Repairs then compiles MJML into responsive HTML. MJML v5 is async, v4 is sync,
 * so the result is always awaited.
 */
export async function compileMjml(input: string): Promise<CompileResult> {
  const { code, fixes } = repairMjml(input);
  const warnings = fixes.map((f) => `Auto-repair: ${f}`);
  const errors: string[] = [];

  if (!code) {
    return { mjml: "", html: "", warnings, errors: ["No MJML code was provided."] };
  }

  const compile = mjml2html as unknown as MjmlFn;
  try {
    const result = await compile(code, { validationLevel: "soft", minify: false });
    for (const e of result.errors ?? []) {
      warnings.push(`MJML: ${(e.formattedMessage ?? e.message).replace(/\s+/g, " ").trim()}`);
    }
    return { mjml: code, html: cleanHtml(result.html), warnings, errors };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "MJML compilation failed.");
    return { mjml: code, html: "", warnings, errors };
  }
}
