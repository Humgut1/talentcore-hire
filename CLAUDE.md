# ATS — Claude Code 작업 규칙

## 프로젝트 개요
- 이 프로젝트는 ATS (채용 관리 시스템)야
- Next.js 15 App Router + Supabase + Resend + Vercel 스택

## 작업 규칙
- 한 번에 하나의 작업만 해줘
- "확인했어" 또는 "다음" 이라고 하기 전까지 다음 작업 하지 마
- 외부 UI 라이브러리 추가하지 마 (Tailwind만 사용)
- ORM 사용하지 마 (Supabase 클라이언트로 직접 쿼리)
- 파일 만들 때 전체 코드 보여줘

---

# Design System Specification: Editorial Soft-Minimalism

## 1. Overview & Creative North Star
**The Creative North Star: "The Fluid Sanctuary"**

This design system rejects the "mechanical" nature of traditional fintech interfaces. Instead of rigid grids and data-heavy tables, we aim for a **Fluid Sanctuary**—a digital environment that feels breathable, protective, and hyper-legible.

To achieve a signature high-end look, this system utilizes **Intentional Asymmetry** and **Tonal Depth**. We move beyond the "template" look by treating white space not as "empty room," but as a structural element that guides the eye. By leveraging extreme corner radii (up to 48px) and a "No-Line" philosophy, the UI feels organic and sculpted rather than engineered.

---

## 2. Colors & Surface Philosophy

Our palette is anchored by a vibrant, high-energy primary blue, balanced against a sophisticated range of "Cool Greys" and "Soft Surfaces."

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections.
Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface-container-low` section should sit directly on a `surface` background. This creates a "molded" look where the interface feels like it was carved from a single block of material.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine, heavy-weight paper.
- **Base:** `surface` (#f6f9ff)
- **Sub-sections:** `surface-container-low` (#edf4fe)
- **Floating Elements:** `surface-container-lowest` (#ffffff)
- **Active/Inset Elements:** `surface-container-high` (#e1e9f2)

### The "Glass & Gradient" Rule
To elevate CTAs beyond standard flat buttons, use a subtle **Linear Gradient** (from `primary` to `primary_container`). This adds a microscopic sense of volume that conveys premium quality. For floating overlays, use **Glassmorphism**: apply `surface_container_lowest` at 80% opacity with a 20px backdrop blur to maintain context of the underlying layers.

---

## 3. Typography: The Editorial Voice

We use **Plus Jakarta Sans** to provide a modern, geometric clarity that feels friendlier than standard system fonts.

- **Display (Display-LG/MD):** Used for "Hero Moments"—large account balances or welcome messages. These should be set with tight tracking (-2%) to feel authoritative.
- **Headlines (Headline-LG/MD):** The primary storytelling tool. Use these to frame the UI as an editorial magazine.
- **Body (Body-LG/MD):** Optimized for high-density information. Ensure line height is set to at least 1.5x to maintain the "breathable" feel of the North Star.

**Typography as Brand:** The contrast between a `display-lg` headline and a `body-sm` label creates a sophisticated hierarchy that feels intentional and curated, rather than a generic list of data.

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are often messy. In this system, we use **Tonal Layering** to convey importance.

- **The Layering Principle:** Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#edf4fe) background. The delta in lightness provides a "soft lift" that is easier on the eyes than a shadow.
- **Ambient Shadows:** If a floating state is required (e.g., a bottom sheet), use a shadow with a 40px–60px blur at 4% opacity. The shadow color must be a tinted version of `on-surface` (#151c23), never pure black.
- **The Ghost Border:** If a boundary is strictly required for accessibility, use the `outline-variant` token at 15% opacity. High-contrast, 100% opaque borders are strictly forbidden.

---

## 5. Component Guidelines

### Buttons: The Tactile Interaction
- **Primary:** Gradient of `primary` to `primary_container`. Radius: `full` (9999px). No border.
- **Secondary:** `secondary_container` background with `on_secondary_container` text.
- **Tertiary:** No background. Bold `primary` text.

### Cards & Lists: The "Breathable" Container
- **Rule:** Forbid the use of divider lines.
- **Execution:** Separate list items using 12px–16px of vertical white space. For distinct content groups, use a background shift to `surface_container_low`.
- **Corner Radius:** Default is `lg` (2rem / 32px) for cards. This extreme roundness is the signature of the system.

### Input Fields: The Soft Inset
- **Style:** Instead of a box with a border, use a `surface_container_highest` background with a `md` (1.5rem) corner radius. On focus, the background shifts to `surface_container_lowest` with a 2px `primary` ghost-border (20% opacity).

### Additional Signature Component: The "Action Sheet"
- A bottom-anchored container using `surface_container_lowest` with a `xl` (3rem) top-corner radius. It must utilize a backdrop-blur on the layer behind it to create the "Sanctuary" effect.

---

## 6. Do's and Don'ts

### Do:
- **Do** use asymmetrical margins (e.g., a wider left margin for headlines) to create an editorial feel.
- **Do** lean heavily on `surface_container_lowest` (#ffffff) to highlight the most important interactive elements.
- **Do** use the `primary` blue sparingly as a "heartbeat" color—guiding the user to the next logical step.

### Don't:
- **Don't** use 1px dividers. If you feel you need a divider, use 24px of white space instead.
- **Don't** use sharp corners. Even the smallest chip should have at least an `sm` (0.5rem) radius.
- **Don't** crowd the screen. If a screen feels "busy," move secondary information to a nested "Discovery" layer using a tonal shift.
- **Don't** use pure black (#000000) for text. Always use `on_surface` (#151c23) to maintain the soft-minimalist tonal range.
