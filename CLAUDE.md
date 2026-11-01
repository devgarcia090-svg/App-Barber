# Cómo trabajar en este repo

Lee `README.md` para saber de qué va el proyecto. Si una subcarpeta tiene su
propio `CLAUDE.md`, ese manda sobre este.

Responde siempre en español.

## Principios (basados en las observaciones de Karpathy sobre los fallos de los LLM)

1. **Pensar antes de hacer.** Di qué suposiciones haces. Si algo es ambiguo y
   cambia el resultado, pregunta; si no, elige lo razonable y dilo en una línea.
2. **Lo más simple que funcione.** Nada que no se haya pedido: ni abstracciones
   para un solo uso, ni opciones "por si acaso", ni manejo de errores imposibles.
   Si 200 líneas pueden ser 50, que sean 50.
3. **Cambios quirúrgicos.** Toca solo lo necesario. Respeta el estilo existente.
   No "mejores" código, textos o formato ajenos a la tarea; si ves algo mal,
   menciónalo. Limpia solo lo que tu cambio dejó huérfano.
4. **Objetivo verificable.** Define antes cómo sabrás que está bien (build, lint,
   test, captura, comprobar la página) y compruébalo antes de decir que está hecho.

## Eficiencia

- Lanza en paralelo las búsquedas y lecturas que no dependan entre sí.
- Para explorar mucho código o investigar, usa un subagente y quédate con la conclusión.
- No leas archivos enteros si basta con una parte; no repitas lo ya comprobado.

## Herramientas instaladas (`.claude/`)

**Desarrollo** (obra/superpowers): `brainstorming` → `writing-plans` →
`subagent-driven-development` / `executing-plans`, más `systematic-debugging`,
`verification-before-completion`, `test-driven-development`,
`requesting-code-review`, `receiving-code-review`, `dispatching-parallel-agents`.
Úsalas en trabajo de cierto tamaño; para cambios pequeños, directo.

**Contenido y marketing** (coreyhaines31/marketingskills): `copywriting`,
`copy-editing`, `content-strategy`, `social`, `emails`, `launch`, `video`,
`ad-creative`, `marketing-psychology`, `marketing-ideas`, `product-marketing`,
`seo-audit`, `ai-seo`, `schema`. Junto con las de diseño ya existentes
(`brand`, `design`, `banner-design`, `slides`, `ui-ux-pro-max`…).

**Utilidades** (anthropics/skills): `skill-creator` (crear skills propias),
`doc-coauthoring`, `webapp-testing` (Playwright). Las skills de documentos
(PDF, Word, Excel, PowerPoint) se activan como plugin en `.claude/settings.json`.

**Subagentes** (`.claude/agents/`): `code-reviewer`, `postgres-pro` (Supabase),
`seo-specialist`, `content-marketer`, `research-analyst`.
