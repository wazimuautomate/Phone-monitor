---
name: Obsidian Monitor
colors:
  surface: '#0f150e'
  surface-dim: '#0f150e'
  surface-bright: '#343b33'
  surface-container-lowest: '#0a1009'
  surface-container-low: '#171d16'
  surface-container: '#1b211a'
  surface-container-high: '#252c24'
  surface-container-highest: '#30362f'
  on-surface: '#dee5d9'
  on-surface-variant: '#bdcab9'
  inverse-surface: '#dee5d9'
  inverse-on-surface: '#2c322b'
  outline: '#889485'
  outline-variant: '#3e4a3d'
  surface-tint: '#6cde7c'
  primary: '#6cde7c'
  on-primary: '#003911'
  primary-container: '#30a54b'
  on-primary-container: '#00320e'
  inverse-primary: '#006e28'
  secondary: '#ffb4aa'
  on-secondary: '#690004'
  secondary-container: '#dc0313'
  on-secondary-container: '#ffece9'
  tertiary: '#dbc900'
  on-tertiary: '#363100'
  tertiary-container: '#bdad00'
  on-tertiary-container: '#474000'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#89fb95'
  primary-fixed-dim: '#6cde7c'
  on-primary-fixed: '#002107'
  on-primary-fixed-variant: '#00531c'
  secondary-fixed: '#ffdad5'
  secondary-fixed-dim: '#ffb4aa'
  on-secondary-fixed: '#410001'
  on-secondary-fixed-variant: '#930008'
  tertiary-fixed: '#f9e526'
  tertiary-fixed-dim: '#dbc900'
  on-tertiary-fixed: '#201c00'
  on-tertiary-fixed-variant: '#4f4800'
  background: '#0f150e'
  on-background: '#dee5d9'
  surface-variant: '#30362f'
typography:
  display:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 20px
  stack-gap-lg: 24px
  stack-gap-md: 16px
  stack-gap-sm: 8px
  card-padding: 16px
  grid-gutter: 12px
---

## Brand & Style

The design system is engineered for a "Phone Monitor" Agent app, prioritizing high-performance utility with a calm, non-intrusive aesthetic. The brand personality is vigilant yet quiet, characterized by a "Deep Dark" theme that reduces eye strain during long monitoring sessions. 

The visual style is a fusion of **Minimalism** and **Modern SaaS** aesthetics. It utilizes a strict card-based architecture to modularize complex data streams. The interface relies on significant whitespace (negative space) to prevent information density from becoming overwhelming. Subtle micro-interactions—such as soft pulses on active states—provide a sense of "live" connectivity without distracting the user.

## Colors

The palette is optimized for OLED displays and high-contrast legibility in low-light environments. 

- **Background & Surfaces**: A three-tier dark grey system creates depth without relying on heavy shadows. The base background is nearly black, while surfaces and elevated states provide clear structural hierarchy.
- **Accents**: The Primary Green is reserved strictly for "Active," "Live," or "Healthy" states. Secondary Red and Warning Yellow are used sparingly to signal critical alerts or destructive actions.
- **Typography**: Pure white is used for primary headings to ensure maximum contrast, while a muted grey handles secondary metadata and labels to maintain visual quietness.

## Typography

This design system uses **Outfit** exclusively to achieve a geometric, modern look that remains highly readable. 

- **Headlines**: Use medium to semi-bold weights with slight negative letter-spacing to create a tight, professional appearance.
- **Body Text**: Maintain a regular weight for maximum legibility.
- **Labels**: Used for status indicators and small caps data points; these should often use the `text_muted_hex` color.
- **Scale**: The type scale is conservative, ensuring that even on small mobile screens, the data-heavy nature of a monitor app remains organized.

## Layout & Spacing

The layout follows a **Fluid Grid** model optimized for mobile viewport constraints. 

- **Safe Zones**: A standard 20px margin is maintained on the left and right edges of the screen.
- **Rhythm**: Vertical spacing follows an 8px base unit. Most components are separated by 16px (`stack-gap-md`) to ensure distinct visual grouping.
- **Cards**: Use a standard 16px internal padding. In dual-column grid layouts (e.g., small metric widgets), use a 12px gutter.
- **Adaptation**: For tablet views, the single-column list of cards should reflow into a 2-column masonry or grid layout to utilize the extra horizontal real estate.

## Elevation & Depth

Hierarchy in this design system is established through **Tonal Layers** and **Low-contrast Outlines** rather than traditional drop shadows.

- **Level 0 (Background)**: The base `#0B0B0D` layer.
- **Level 1 (Cards/Items)**: Uses `#141417` with a 1px solid border of `#26262B`. This creates a crisp, architectural feel.
- **Level 2 (Modals/Popovers)**: Uses `#1D1D22`. For these elements, a very subtle, diffused black shadow (0px 8px 24px rgba(0,0,0,0.5)) can be applied to separate the element from the Level 1 surfaces below.
- **Interactions**: On press, cards should subtly scale (98%) or brighten the border color to provide tactile feedback.

## Shapes

The design system utilizes a generous **20px radius** for all primary containers and cards. This high degree of roundedness softens the technical nature of the app, making the monitoring experience feel more "lifestyle" and approachable.

- **Primary Containers**: 20px (Cards, Main Action Buttons).
- **Secondary Elements**: 12px (Small input fields, Nested inner cards).
- **Small Elements**: 8px (Status chips, Tooltips).
- **Icons**: Lucide-style icons should use a 2px stroke width with slightly rounded joins to match the component corner radius.

## Components

### Buttons
- **Primary**: Solid `#2FA44A` background with `#FFFFFF` text. 20px border radius.
- **Ghost/Secondary**: Transparent background with a `#26262B` border. Use for less frequent actions.

### Cards & Widgets
- The core of the UI. Each card should feature a title in `headline-md` and a Lucide icon for quick scanning. 
- Use "Live Indicators" (a 6px solid green circle with a soft outer glow) in the top-right corner of cards representing active processes.

### Chips/Badges
- Small, pill-shaped indicators for status (e.g., "CPU: 24%"). 
- Background: `#1D1D22`. Text: `label-md`.

### Input Fields
- Background: `#0B0B0D` (recessed into the card surface). 
- Border: 1px solid `#26262B`. 
- Focus State: Border color changes to `#2FA44A`.

### Lists
- Use a "Divideless" approach where the 16px gap between cards provides the separation, or use subtle 1px lines of `#26262B` for internal list items within a single card.

### Progress Bars
- Track: `#26262B`. 
- Fill: Primary Green, or Red/Yellow based on threshold limits. 
- Height: 4px or 6px with rounded caps.